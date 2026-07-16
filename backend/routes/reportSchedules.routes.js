const express = require('express');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const client = require('../connection');

const router = express.Router();
const workerIntervalMs = Number(process.env.REPORT_SCHEDULE_INTERVAL_MS || 60000);
const workerLookbackWindowMs = Number(process.env.REPORT_SCHEDULE_LOOKBACK_WINDOW_MS || 86400000);
let workerStarted = false;
let workerRunning = false;
let workerTimer = null;
let workerLastRunAt = null;
const inFlightScheduleSends = new Set();

const reportEmailProvider = String(process.env.REPORT_EMAIL_PROVIDER || '').trim().toLowerCase();
const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
const reportSenderName = String(process.env.REPORT_SENDER_NAME || 'Support Team').trim() || 'Support Team';
const defaultSenderEmail = process.env.EMAIL_USER || process.env.SMTP_USER || 'notifications@example.com';
const defaultReceiverEmail = process.env.REPORT_DEFAULT_RECEIVER || 'notifications@example.com';
const defaultReportScheduleTimeZone = String(
  process.env.REPORT_SCHEDULE_TIMEZONE ||
    process.env.TZ ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'Asia/Kolkata'
).trim() || 'Asia/Kolkata';
const scheduleClockFormatterCache = new Map();

const isValidTimeZone = (value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
};

const sanitizeScheduleTimeZone = (value) => {
  const candidate = String(value || '').trim();
  return isValidTimeZone(candidate) ? candidate : '';
};

const fallbackScheduleTimeZone = sanitizeScheduleTimeZone(defaultReportScheduleTimeZone) || 'Asia/Kolkata';

const resolveScheduleTimeZone = (schedule = {}) =>
  sanitizeScheduleTimeZone(schedule.timezone || schedule.timeZone || schedule.tz) || fallbackScheduleTimeZone;

const isResendEnabled = () => {
  if (reportEmailProvider === 'resend') return true;
  if (reportEmailProvider === 'smtp') return false;
  return Boolean(resendApiKey);
};

const extractEmailAddress = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] || raw).trim();
};

const buildFromAddress = (value) => {
  const email = extractEmailAddress(value || process.env.REPORT_FROM_EMAIL || defaultSenderEmail);
  if (!email) return `${reportSenderName} <${defaultSenderEmail}>`;
  return `${reportSenderName} <${email}>`;
};

const validateResendFromAddress = (from) => {
  const email = extractEmailAddress(from);
  if (!email.includes('@')) {
    const error = new Error('Invalid sender email. Set REPORT_FROM_EMAIL to a valid verified domain.');
    error.statusCode = 400;
    throw error;
  }
  if (/@example\.com$/i.test(email)) {
    const error = new Error('Set REPORT_FROM_EMAIL to your verified domain before using Resend.');
    error.statusCode = 400;
    throw error;
  }
  if (/@[^@]*(web\.app|firebaseapp\.com)$/i.test(email)) {
    const error = new Error(
      'Resend sender must use your verified custom domain. Do not use web.app/firebaseapp.com addresses.'
    );
    error.statusCode = 400;
    throw error;
  }
};

const ensureReportSchedulesTable = async () => {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS reports;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS reports.report_schedules (
      id text PRIMARY KEY,
      schedule jsonb NOT NULL,
      mail_payload jsonb NOT NULL,
      active boolean NOT NULL DEFAULT true,
      frequency varchar(30),
      last_auto_sent_key text,
      last_sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

const padDatePart = (value) => String(value).padStart(2, '0');

const toInputDate = (date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

const toInputDateValue = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toInputDate(value);
  const dateText = String(value).trim();
  if (!dateText) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(dateText)) return dateText.slice(0, 10);

  const parsedDate = new Date(dateText);
  return Number.isNaN(parsedDate.getTime()) ? '' : toInputDate(parsedDate);
};

const getScheduleClockFormatter = (timeZone) => {
  if (scheduleClockFormatterCache.has(timeZone)) {
    return scheduleClockFormatterCache.get(timeZone);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  scheduleClockFormatterCache.set(timeZone, formatter);
  return formatter;
};

const getScheduleClock = (date = new Date(), timeZone = fallbackScheduleTimeZone) => {
  const safeTimeZone = sanitizeScheduleTimeZone(timeZone) || fallbackScheduleTimeZone;
  const formatter = getScheduleClockFormatter(safeTimeZone);
  const parts = formatter.formatToParts(date);
  const partMap = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      partMap[part.type] = part.value;
    }
  }

  const hour = Number(partMap.hour || 0);
  const minute = Number(partMap.minute || 0);
  const year = String(partMap.year || '0000');
  const month = String(partMap.month || '01');
  const day = String(partMap.day || '01');

  return {
    timeZone: safeTimeZone,
    weekday: String(partMap.weekday || ''),
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
    dateKey: `${year}-${month}-${day}`,
    year: Number(year),
    month: Number(month),
    day: Number(day)
  };
};

const to12HourTime = (hour24, minute = 0) => {
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 || 12;
  return { hour, minute, meridiem };
};

const parseScheduleTime = (value) => {
  if (!value) return null;

  const match = String(value)
    .trim()
    .match(/^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/i);

  if (!match) return null;

  const rawHour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();

  if (!Number.isFinite(rawHour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (rawHour < 1 || rawHour > 12) return null;
    return { hour: rawHour, minute, meridiem };
  }

  if (rawHour < 0 || rawHour > 23) return null;
  return to12HourTime(rawHour, minute);
};

const getScheduleTimeParts = (schedule = {}) => {
  const parsedTime = parseScheduleTime(schedule.time || schedule.scheduledTime || schedule.sendTime);
  const rawHour = Number(schedule.hour ?? schedule.hours);
  const rawMinute = Number(schedule.minute ?? schedule.minutes);
  const minute = Number.isFinite(rawMinute) && rawMinute >= 0 && rawMinute <= 59
    ? rawMinute
    : parsedTime?.minute || 0;
  const meridiem = String(schedule.meridiem || parsedTime?.meridiem || '').toUpperCase();

  if (Number.isFinite(rawHour)) {
    if (meridiem === 'AM' || meridiem === 'PM') {
      const hour = rawHour >= 1 && rawHour <= 12 ? rawHour : parsedTime?.hour || 12;
      return { hour, minute, meridiem };
    }

    if (rawHour >= 0 && rawHour <= 23) {
      return to12HourTime(rawHour, minute);
    }
  }

  return parsedTime || { hour: 12, minute: 0, meridiem: 'AM' };
};

const formatScheduleTime = ({ hour, minute, meridiem }) =>
  `${hour}:${padDatePart(minute)} ${meridiem}`;

const toScheduleMinutes = (schedule) => {
  const { hour, minute, meridiem } = getScheduleTimeParts(schedule);
  let hour24 = hour;

  if (meridiem === 'PM' && hour24 !== 12) hour24 += 12;
  if (meridiem === 'AM' && hour24 === 12) hour24 = 0;

  return hour24 * 60 + minute;
};

const getScheduleOccurrenceKey = (
  schedule,
  date,
  timeZone = resolveScheduleTimeZone(schedule),
  clock = null
) => {
  const scheduleClock = clock || getScheduleClock(date, timeZone);
  const dateKey = scheduleClock.dateKey;
  const frequency = schedule?.frequency || 'Weekly';

  if (frequency === 'Single Time') {
    return schedule.singleDate === dateKey ? `single:${dateKey}` : '';
  }

  if (frequency === 'Daily') {
    return `daily:${dateKey}`;
  }

  if (frequency === 'Monthly') {
    const monthDay = Number(schedule.monthDay || 1);
    const lastDay = new Date(Date.UTC(scheduleClock.year, scheduleClock.month, 0)).getUTCDate();
    const scheduledDay = Math.min(Number.isFinite(monthDay) && monthDay > 0 ? monthDay : 1, lastDay);
    return scheduleClock.day === scheduledDay
      ? `monthly:${scheduleClock.year}-${padDatePart(scheduleClock.month)}`
      : '';
  }

  const targetWeekday = String(schedule.weekday || schedule.day || schedule.weekDay || '').trim();
  return targetWeekday === scheduleClock.weekday ? `weekly:${dateKey}` : '';
};

const isScheduleDueNow = (
  schedule,
  date = new Date(),
  timeZone = resolveScheduleTimeZone(schedule),
  clock = null
) => {
  if (!schedule?.active) return false;
  const scheduleClock = clock || getScheduleClock(date, timeZone);
  if (toScheduleMinutes(schedule) !== scheduleClock.totalMinutes) return false;
  return Boolean(getScheduleOccurrenceKey(schedule, date, timeZone, scheduleClock));
};

const normalizeSchedule = (schedule, id, active) => {
  const timeParts = getScheduleTimeParts(schedule);
  const frequency = schedule.frequency || 'Weekly';
  const timeZone = resolveScheduleTimeZone(schedule);
  const { timezone: _legacyTimeZone, tz: _legacyTz, ...scheduleWithoutLegacyTimezoneKeys } = schedule || {};
  const singleDate = toInputDateValue(
    schedule.singleDate || schedule.date || schedule.scheduleDate || schedule.scheduledDate
  );

  return {
    ...scheduleWithoutLegacyTimezoneKeys,
    id,
    active,
    frequency,
    hour: timeParts.hour,
    minute: timeParts.minute,
    meridiem: timeParts.meridiem,
    time: formatScheduleTime(timeParts),
    weekday: schedule.weekday || schedule.day || schedule.weekDay || '',
    singleDate: singleDate || schedule.singleDate || '',
    timeZone,
    updatedAt: new Date().toISOString()
  };
};

const findDueOccurrenceKeyInWindow = (schedule, windowStart, windowEnd) => {
  if (!schedule?.active) return '';

  const startMs = windowStart instanceof Date ? windowStart.getTime() : Number.NaN;
  const endMs = windowEnd instanceof Date ? windowEnd.getTime() : Number.NaN;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return '';

  const effectiveLookbackMs =
    Number.isFinite(workerLookbackWindowMs) && workerLookbackWindowMs > 0
      ? workerLookbackWindowMs
      : 86400000;
  const boundedStartMs = Math.max(startMs, endMs - effectiveLookbackMs);
  const scheduleTimeZone = resolveScheduleTimeZone(schedule);
  const scheduleMinutes = toScheduleMinutes(schedule);
  const minuteMs = 60000;
  let cursorMs = Math.floor(boundedStartMs / minuteMs) * minuteMs;

  while (cursorMs <= endMs) {
    const cursorDate = new Date(cursorMs);
    const clock = getScheduleClock(cursorDate, scheduleTimeZone);
    if (clock.totalMinutes === scheduleMinutes) {
      const occurrenceKey = getScheduleOccurrenceKey(schedule, cursorDate, scheduleTimeZone, clock);
      if (occurrenceKey) return occurrenceKey;
    }
    cursorMs += minuteMs;
  }

  return '';
};

const normalizeRecipients = (value) => {
  const recipients = Array.isArray(value) ? value : [value || defaultReceiverEmail];
  return Array.from(new Set(recipients.map((item) => String(item || '').trim()).filter(Boolean)));
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseJsonValue = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseJsonObject = (value) => {
  const parsed = parseJsonValue(value);
  return isPlainObject(parsed) ? parsed : null;
};

const parseJsonArray = (value) => {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed) ? parsed : [];
};

const normalizeFilterText = (value) => String(value ?? '').trim();

const getGeneralReportFilterOptions = async ({ department = '', subDepartment = '' } = {}) => {
  const normalizedDepartment = normalizeFilterText(department);
  const normalizedSubDepartment = normalizeFilterText(subDepartment);

  const departmentsPromise = client.query(
    `
    SELECT DISTINCT COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) AS department
    FROM ticketing_system.threshold_master
    WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) IS NOT NULL
    ORDER BY 1
    `
  );

  const subDepartmentsPromise = normalizedDepartment
    ? client.query(
      `
      SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
      FROM ticketing_system.threshold_master
      WHERE COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $1
        AND COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
      ORDER BY 1
      `,
      [normalizedDepartment]
    )
    : client.query(
      `
      SELECT DISTINCT COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) AS sub_department
      FROM ticketing_system.threshold_master
      WHERE COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) IS NOT NULL
      ORDER BY 1
      `
    );

  const reportTypesPromise = (() => {
    const params = [];
    const where = [
      `NULLIF(trim(input_screen), '') IS NOT NULL`
    ];

    if (normalizedDepartment) {
      params.push(normalizedDepartment);
      where.push(`COALESCE(NULLIF(trim(department), ''), NULLIF(trim(management_field), '')) = $${params.length}`);
    }
    if (normalizedSubDepartment) {
      params.push(normalizedSubDepartment);
      where.push(`COALESCE(NULLIF(trim(sub_department), ''), NULLIF(trim(erp_product_code), '')) = $${params.length}`);
    }

    return client.query(
      `
      SELECT DISTINCT trim(input_screen) AS report_type
      FROM ticketing_system.threshold_master
      WHERE ${where.join(' AND ')}
      ORDER BY 1
      `,
      params
    );
  })();

  const [departmentsResult, subDepartmentsResult, reportTypesResult] = await Promise.all([
    departmentsPromise,
    subDepartmentsPromise,
    reportTypesPromise
  ]);

  const departments = departmentsResult.rows
    .map((row) => row.department)
    .filter(Boolean);

  const subDepartments = subDepartmentsResult.rows
    .map((row) => row.sub_department)
    .filter(Boolean);

  const reportTypes = reportTypesResult.rows
    .map((row) => row.report_type)
    .filter(Boolean);

  return {
    departments,
    sub_departments: subDepartments,
    report_types: reportTypes,
    selected: {
      department: normalizedDepartment || null,
      sub_department: normalizedSubDepartment || null
    }
  };
};

const normalizeReportKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const quoteReportIdent = (value) => `"${String(value).replace(/"/g, '""')}"`;
const quoteQualifiedReportIdent = (value) => String(value).split('.').map(quoteReportIdent).join('.');
const parsePositiveInteger = (value, fallback, max = 1000) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const GENERAL_REPORT_SOURCE_CANDIDATES = {
  mixing: {
    cottonhvidataentry: ['mixing.cotton_hvi_data_entry'],
    fibredataentry: ['mixing.fibre_data_entry'],
    afisdataentry: ['mixing.afis_data_entry'],
    afis6cottondataentry: ['mixing.afis6_cotton_data_entry'],
    afis6mmfdataentry: ['mixing.afis6_mmf_data_entry'],
    moisturedataentry: ['mixing.moisture_data_entry'],
    opennessdataentry: ['mixing.openness_inspection']
  },
  blowroom: {
    blowroomsync: ['blowroom.blow_room_sync'],
    blowroomsyncdataentry: ['blowroom.blow_room_sync'],
    brwastestudyentry: ['blowroom.br_waste_study', 'mixing.br_waste_study'],
    droptestdataentry: ['blowroom.drop_test']
  },
  carding: {
    betweenwithincarddataentry: ['carding.inspections'],
    trialsdataentryform: ['carding.carding_change_request'],
    natidataentry: ['carding.nati_data_entry'],
    udataentry: ['carding.u_data_entry'],
    upercentdataentry: ['carding.u_data_entry'],
    carddfkpressurechecking: ['carding.card_dfk_pressure_checking'],
    wheelchange: ['carding.card_change_control']
  },
  comber: {
    ribbonlapcvdataentry: ['comber.ribbon_lap_cv_qc'],
    // Frontend label is "Ribbon Lap CV1M Data Entry", which normalizes to
    // "ribbonlapcv1mdataentry" — alias it onto the same table.
    ribbonlapcv1mdataentry: ['comber.ribbon_lap_cv_qc'],
    natidataentry: ['comber.nati_data_entry'],
    udataentry: ['comber.u_data_entry'],
    upercentdataentry: ['comber.u_data_entry'],
    combernre: ['comber.nre_data_entry'],
    combernrepercent: ['comber.nre_data_entry'],
    comberefficiency: ['comber.efficiency_data_entry'],
    // "Comber Nolis %" is served by the drawframe/wrapping route and lives in the wrapping
    // schema, not under comber — but the frontend files it under the Comber sub-department.
    combernolis: ['wrapping.comber_noil_percent'],
    combernolispercent: ['wrapping.comber_noil_percent']
  },
  drawframe: {
    oneyardhalfyardcventry: ['drawframe.yarn_cv_percent'],
    yarncvcalculationform: ['drawframe.yarn_cv_percent'],
    drawframecotsdataentry: ['drawframe.cots_data_entry'],
    udataentry: ['drawframe.u_data_entry'],
    upercentdataentry: ['drawframe.u_data_entry'],
    // "A%" is served by the drawframe/wrapping route and lives in the wrapping schema.
    a: ['wrapping.a_percent']
  },
  simplex: {
    processparameter: ['simplex.simplex_process_parameter'],
    smxcotschangedataentry: ['simplex.simplex_inspections'],
    smxbreaksstudyreport: ['simplex.smx_breaks_study_header'],
    udataentry: ['simplex.u_data_entry'],
    upercentdataentry: ['simplex.u_data_entry'],
    wheelchange: ['simplex.wheel_change'],
    // "Stretch %" is served by the drawframe/wrapping route and lives in the wrapping schema.
    stretch: ['wrapping.stretch_percent'],
    stretchpercent: ['wrapping.stretch_percent']
  },
  spinning: {
    cotschecking: ['spinning.cots_checking'],
    countchange: ['spinning.count_change_inspections'],
    ringframelogbook: ['spinning.ring_frame_inspections'],
    speedchecking: ['spinning.speed_checking'],
    lycramissing: ['spinning.lycra_missing'],
    bottomapronchecking: ['spinning.bottom_apron_checking'],
    lycracentering: ['spinning.lycra_centering'],
    // Frontend label is "Lycra Out of Centering", which normalizes to
    // "lycraoutofcentering" — alias it onto the same table as lycracentering.
    lycraoutofcentering: ['spinning.lycra_centering'],
    rsmlycrasensorcheckingonline: ['spinning.rsm_and_lycrasensor_cheking_online'],
    rsmlycrasensorcheckingoffline: ['spinning.rsm_and_lycrasensor_cheking_offline'],
    wheelchange: ['spinning.wheel_change']
  },
  autoconer: {
    processparameter: ['autoconer.autoconer_process_parameter'],
    ppautoconerq2: ['autoconer.autoconer_q2_inspection'],
    ppautoconerq3: ['autoconer.autoconer_q3_inspection'],
    rewindingstudy: ['autoconer.rewinding_study'],
    conedensity: ['autoconer.cone_density'],
    inspectiondataentry: ['autoconer.inspection_data_entry'],
    conepackingaudit: ['autoconer.cone_packing_audit'],
    lycrachecking: ['autoconer.lycra_checking_inspections'],
    countwisecutsrecord: ['autoconer.count_wise_cuts'],
    splicestrength: ['autoconer.splice_strength'],
    drumwiseappearance: ['autoconer.drum_wise'],
    cspparameterentries: ['autoconer.parameter_entries'],
    uparameterentries: ['autoconer.parameter_entries']
  }
};

// The Openness form (mixing/openness) writes its header fields to
// mixing.openness_inspection and its per-entry measurement fields to the
// child table mixing.openness_entries. The generic single-table candidate
// list above can only see the header table, so the custom report was
// missing every entry-level field the form actually collects. This joined
// source lists exactly the fields present on the Openness form UI (no
// system/id columns), so "available fields" matches the form 1:1.
const GENERAL_REPORT_CUSTOM_SOURCES = {
  spinning: {
    // COTS Checking form — spinning.cots_checking has no "checking type" column;
    // report only the fields the form actually collects.
    cotschecking: {
      fromClause: 'spinning.cots_checking',
      selectColumns: [
        'entry_id',
        'inspectiondate',
        'machineno',
        'lhs_value',
        'rhs_value',
        'lhs_textremarks',
        'rhs_textremarks',
        'createdat'
      ],
      dateColumn: 'inspectiondate'
    },
    // Count Change form — header table + per-reading child table. Drop count_change_type
    // and the per-reading average/rollup columns (reading_avg, count_avg, strength_avg,
    // generated_rows, overall_csp, cv_percent_2), which aren't collected by the form.
    countchange: {
      fromClause: 'spinning.count_change_inspections i '
        + 'JOIN spinning.count_change_readings r ON r.inspection_id = i.id',
      selectColumns: [
        'i.entry_id',
        'i.rf_no',
        'i.lycra_draft',
        'i.count_name_from',
        'i.count_name_to',
        'i.no_of_readings',
        'r.reading_no',
        'r.reading_value',
        'r.count',
        'r.cv_percent',
        'r.strength',
        'r.mean',
        'r.csp',
        'i.created_at'
      ],
      dateColumn: 'i.entry_date'
    },
    // Process Parameter form (POST /spinning/process-parameter) — single table, all fields live on spinning.spinning_qc_header.
    processparameter: {
      fromClause: 'spinning.spinning_qc_header',
      selectColumns: [
        'entry_id',
        'count_name',
        'consignee_name',
        'machine_no',
        'bottom_roll_setting',
        'top_roll_setting',
        'break_draft',
        'total_draft',
        'tpi_tm',
        'spacer',
        'traveller',
        'speed',
        'make',
        'denier',
        'merge_no',
        'slub_partcy_code',
        'slub_mtr',
        'pause_min',
        'pause_max',
        'slub_min',
        'slub_max',
        'thickness_min',
        'thickness_max',
        'ramp',
        'offset',
        'lycra_draft',
        'lycra_percent',
        'created_at'
      ],
      dateColumn: 'creation_date'
    },
    // Ring Frame Log Book form — header table + per-machine row table + summary table,
    // joined so the general report sees the full set of fields the form collects.
    ringframelogbook: {
      fromClause: 'spinning.ring_frame_inspections i '
        + 'JOIN spinning.ring_frame_rows r ON r.inspection_id = i.id '
        + 'JOIN spinning.ring_frame_summary s ON s.inspection_id = i.id',
      selectColumns: [
        'i.entry_id',
        'i.entry_date',
        'i.shift',
        'i.checker_name',
        'r.mc_no',
        'r.lycra',
        'r.bobbin_color',
        'r.spindle_1',
        'r.spindle_2',
        'r.spindle_3',
        'r.spindle_4',
        'r.spindle_5',
        'r.spindle_6',
        'r.lycra_missing',
        'r.guide_roll_lapping',
        'r.others',
        'r.total',
        's.out_of_center',
        's.out_of_center_ac',
        's.out_of_center_rf',
        's.fault_cops',
        's.total_cops',
        's.comments',
        'i.created_at'
      ],
      dateColumn: 'i.entry_date'
    },
    wheelchangetype1: {
      fromClause: 'spinning.wheel_change',
      selectColumns: ['entry_id', 'created_at'],
      dateColumn: 'created_at'
    },
    wheelchangetype2: {
      fromClause: 'spinning.wheel_change_inspection',
      selectColumns: ['entry_id', 'created_at'],
      dateColumn: 'created_at'
    },
    wheelchangetype3: {
      fromClause: 'spinning.wheel_change_v2',
      selectColumns: ['entry_id', 'created_at'],
      dateColumn: 'created_at'
    },
    wheelchangetype4: {
      fromClause: 'spinning.wheel_change_type4',
      selectColumns: ['entry_id', 'created_at'],
      dateColumn: 'created_at'
    }
  },
  mixing: {
    // Process Parameter form (POST /mixing/qc) — header table + per-blend child table,
    // same header/child split as Spinning's Count Change / Ring Frame Log Book sources.
    processparameter: {
      fromClause: 'mixing.mixing_qc_header h JOIN mixing.mixing_qc_blends b ON b.qc_id = h.qc_id',
      selectColumns: [
        'h.entry_id',
        'h.consignee_name',
        'h.count_name',
        'h.creation_date',
        'h.status',
        'h.operator',
        'b.blend_no',
        'b.percentage',
        'b.lot_no',
        'b.cut_length',
        'b.tenacity',
        'b.elongation',
        'b.merge_no',
        'h.created_at'
      ],
      dateColumn: 'h.creation_date'
    },
    opennessdataentry: {
      fromClause: 'mixing.openness_inspection i JOIN mixing.openness_entries e ON e.inspection_id = i.id',
      selectColumns: [
        'i.inspection_date',
        'i.br_line_no',
        'i.actual_specific_volume_target',
        'i.no_of_entries',
        'e.machine_name',
        'e.weight',
        'e.volume_1',
        'e.volume_2',
        'e.average_volume',
        'e.apparent_specific_volume',
        'e.actual_op_value',
        'e.beater_type',
        'e.beater_speed_rpm'
      ],
      dateColumn: 'i.inspection_date'
    }
  },
  blowroom: {
    // Process Parameter form (POST /blowroom/header) — single table, all fields live on blowroom.blowroom_header.
    processparameter: {
      fromClause: 'blowroom.blowroom_header',
      selectColumns: [
        'entry_id',
        'count_name',
        'consignee_name',
        'creation_date',
        'line_numbers',
        'rotary_beater_speed',
        'depth',
        'mpm_delivery_speed',
        'mpm_delivery_pascals',
        'condensor_speed',
        'rk_feed_roll_beater',
        'rk_beater_speed',
        'flexi_to_feed_roll_beater',
        'flexi_beater_speed',
        'scutcher_no',
        'rk_mo_speed',
        'kb_speed',
        'grid_bar',
        'lap_weight',
        'uniclean',
        'srs',
        'rk_flexi'
      ],
      dateColumn: 'creation_date'
    },
    // Blow Room Sync form (POST /blowroom/sync) — header + per-entry child table, same
    // header/child split as Openness (blow_room_sync_entries.sync_id -> blow_room_sync.id).
    blowroomsync: {
      fromClause: 'blowroom.blow_room_sync s JOIN blowroom.blow_room_sync_entries e ON e.sync_id = s.id',
      selectColumns: [
        's.entry_id',
        's.inspection_date',
        's.line_no',
        's.variety',
        's.checked_by',
        's.beater',
        's.total_time',
        'e.entry_no',
        'e.value_a',
        'e.value_b',
        'e.value_c',
        'e.sync_percentage'
      ],
      dateColumn: 's.inspection_date'
    },
    // BR Waste Study Entry form (POST /blowroom/br-waste-study) — header + two per-row
    // child tables (type_rows, waste_rows) matched up by row_no within the same study.
    // Both child tables have their own "waste_type" column, so the header's is aliased
    // to avoid a name collision in the report output.
    brwastestudyentry: {
      fromClause: `blowroom.br_waste_study w
        LEFT JOIN blowroom.br_waste_study_type_rows t ON t.study_id = w.id
        LEFT JOIN blowroom.br_waste_study_waste_rows wr ON wr.study_id = w.id AND wr.row_no = t.row_no`,
      selectColumns: [
        'w.entry_id',
        'w.waste_study_id',
        'w.date',
        'w.variety',
        'w.study_type',
        'w.carding_production_kg',
        'w.type_entries',
        'w.waste_type AS study_waste_type',
        'w.waste_kg',
        'w.waste_percent',
        'w.overall_percent',
        'w.remarks',
        't.row_no',
        't.cylinder_speed',
        't.lickerin_speed',
        't.flat_speed',
        't.doffer_speed',
        't.delivery_speed',
        't.wing_setting_1',
        't.wing_setting_2',
        't.mc_no',
        't.mc_production',
        'wr.waste_type AS row_waste_type',
        'wr.waste_kgs_value',
        'wr.waste_kgs_percent'
      ],
      dateColumn: 'w.date'
    },
    // Drop Test Data Entry form (POST /blowroom/drop-test) — single table, explicit list
    // so surrogate id/drop_id columns don't leak into "available fields".
    droptestdataentry: {
      fromClause: 'blowroom.drop_test',
      selectColumns: [
        'entry_id',
        'date',
        'variety',
        'blend',
        'tuft_no',
        'tuft_variety',
        'display_weight',
        'actual_weight',
        'difference',
        'ratio_percent'
      ],
      dateColumn: 'date'
    },
    // BR CV1m Data Entry / "Within Lap" form (POST /blowroom/within-lap-cv) — single table.
    brcv1mdataentry: {
      fromClause: 'blowroom.within_lap_cv',
      selectColumns: [
        'entry_id',
        'record_date',
        'machine_name',
        'variety',
        'type',
        'lap_weight',
        'lap_length',
        'grams_per_meter',
        'samples',
        'average',
        'minimum',
        'maximum',
        'std_deviation',
        'cv_percent'
      ],
      dateColumn: 'record_date'
    },
    // BR Between LapCV% form (POST /blowroom/between-lap-cv) — single table, same shape as within-lap-cv.
    brbetweenlapcv: {
      fromClause: 'blowroom.between_lap_cv',
      selectColumns: [
        'entry_id',
        'record_date',
        'machine_name',
        'variety',
        'type',
        'lap_weight',
        'lap_length',
        'grams_per_meter',
        'samples',
        'average',
        'minimum',
        'maximum',
        'std_deviation',
        'cv_percent'
      ],
      dateColumn: 'record_date'
    }
  },
  carding: {
    // Process Parameter form (POST /carding/qc-header) — single table.
    processparameter: {
      fromClause: 'carding.carding_qc_header',
      selectColumns: [
        'entry_id',
        'count_name',
        'consignee_name',
        'creation_date',
        'machine_no',
        'lickerin_speed',
        'cylinder_speed',
        'flats_speed',
        'delivery_speed',
        'draft_speed',
        'tension_draft',
        'delivery_hank',
        'setting',
        'feed_roll_to_lickerin',
        'lickerin_to_cylinder',
        'cylinder_to_flats',
        'cylinder_to_doffer',
        'sfl',
        'sfd',
        'lickerin',
        'cylinder',
        'doffer',
        'flats'
      ],
      dateColumn: 'creation_date'
    },
    // Between Card Data Entry (POST /carding/between-within-card, type_category = 'Between')
    // — header + two per-entry child tables (sample_weights, hanks) matched by entry_no.
    // carding.inspections has no entry_id column: the form's entry_id IS the header's id.
    betweencarddataentry: {
      fromClause: `(SELECT * FROM carding.inspections WHERE inspection_type = 'Between') i
        LEFT JOIN carding.hanks h ON h.inspection_id = i.id
        LEFT JOIN carding.sample_weights sw ON sw.inspection_id = i.id AND sw.entry_no = h.entry_no
        LEFT JOIN carding.sample_weight_stats sws ON sws.inspection_id = i.id
        LEFT JOIN carding.hank_stats hs ON hs.inspection_id = i.id`,
      selectColumns: [
        'i.id AS entry_id',
        'i.mc_name',
        'i.inspection_type',
        'i.inspection_date',
        'i.num_entries',
        'h.entry_no',
        'sw.value AS sample_weight',
        'h.value AS hank',
        'sws.avg AS sample_weight_avg',
        'sws.max AS sample_weight_max',
        'sws.min AS sample_weight_min',
        'sws.range AS sample_weight_range',
        'sws.sd AS sample_weight_sd',
        'sws.cv AS sample_weight_cv',
        'hs.avg AS hank_avg',
        'hs.max AS hank_max',
        'hs.min AS hank_min',
        'hs.range AS hank_range',
        'hs.sd AS hank_sd',
        'hs.cv AS hank_cv'
      ],
      dateColumn: 'i.inspection_date'
    },
    // Within Card Data Entry — same source table as Between, filtered to inspection_type = 'Within'.
    withincarddataentry: {
      fromClause: `(SELECT * FROM carding.inspections WHERE inspection_type = 'Within') i
        LEFT JOIN carding.hanks h ON h.inspection_id = i.id
        LEFT JOIN carding.sample_weights sw ON sw.inspection_id = i.id AND sw.entry_no = h.entry_no
        LEFT JOIN carding.sample_weight_stats sws ON sws.inspection_id = i.id
        LEFT JOIN carding.hank_stats hs ON hs.inspection_id = i.id`,
      selectColumns: [
        'i.id AS entry_id',
        'i.mc_name',
        'i.inspection_type',
        'i.inspection_date',
        'i.num_entries',
        'h.entry_no',
        'sw.value AS sample_weight',
        'h.value AS hank',
        'sws.avg AS sample_weight_avg',
        'sws.max AS sample_weight_max',
        'sws.min AS sample_weight_min',
        'sws.range AS sample_weight_range',
        'sws.sd AS sample_weight_sd',
        'sws.cv AS sample_weight_cv',
        'hs.avg AS hank_avg',
        'hs.max AS hank_max',
        'hs.min AS hank_min',
        'hs.range AS hank_range',
        'hs.sd AS hank_sd',
        'hs.cv AS hank_cv'
      ],
      dateColumn: 'i.inspection_date'
    },
    // Card Thick Place & CV form (POST /carding/card-thick-place) — header + per-machine
    // child table (card_thick_place_values.header_id -> card_thick_place_header.id).
    cardthickplaceentry: {
      fromClause: `carding.card_thick_place_header ph
        LEFT JOIN carding.card_thick_place_values pv ON pv.header_id = ph.id`,
      selectColumns: [
        'ph.entry_id',
        'ph.entry_date',
        'pv.machine',
        'pv.cv_value',
        'pv.cv_5m_value',
        'pv.unit',
        'ph.remarks',
        'ph.created_at'
      ],
      dateColumn: 'ph.entry_date'
    },
    // DFK Pressure Checking form (POST /carding/dfk-pressure) — single table.
    dfkpressurechecking: {
      fromClause: 'carding.card_dfk_pressure_checking',
      selectColumns: [
        'entry_id',
        'inspection_type',
        'entry_date',
        'machine_name',
        'dfk',
        'ccd',
        'icfd_1',
        'lt',
        'cds',
        'silver_draft',
        'icfd_2',
        'idf_in',
        'idf_out',
        'al_on',
        'created_at'
      ],
      dateColumn: 'entry_date'
    },
    // Carding NRE% form (POST /carding/nre) — single table.
    nre: {
      fromClause: 'carding.nre',
      selectColumns: [
        'entry_id',
        'machine_model',
        'mc_name',
        'cylinder_specs',
        'cylinder_tonnage_1',
        'cylinder_tonnage_2',
        'doffer_specs',
        'doffer_tonnage_1',
        'doffer_tonnage_2',
        'flat_specs',
        'flat_tonnage_1',
        'flat_tonnage_2',
        'lickerin_specs',
        'lickerin_tonnage_1',
        'lickerin_tonnage_2',
        'silver_hank',
        'delivery_mtr_min',
        'fibre_nep_gms_card_mat',
        'fibre_nep_gms_silver',
        'carding_nre_percent',
        'created_at'
      ],
      dateColumn: 'created_at'
    },
    // Nati Data Entry form (POST /carding/nati-data-entry) — header + per-machine
    // neps ratio child table (neps_details.qc_id -> nati_data_entry.id).
    natidataentry: {
      fromClause: `carding.nati_data_entry qc
        LEFT JOIN carding.neps_details n ON n.qc_id = qc.id`,
      selectColumns: [
        'qc.entry_id',
        'qc.type',
        'qc.entry_date',
        'qc.variety',
        'n.mc_no',
        'n.ratio_size_1',
        'n.ratio_size_07',
        'n.ratio_size_05',
        'qc.created_at'
      ],
      dateColumn: 'qc.entry_date'
    },
    // U% Data Entry form (POST /carding/uqc) — single table.
    udataentry: {
      fromClause: 'carding.u_data_entry',
      selectColumns: [
        'entry_id',
        'entry_type',
        'entry_date',
        'shift',
        'variety',
        'mc_no',
        'u_percent',
        'cvm',
        'cvm_1m',
        'cvm_3m',
        'remarks',
        'created_at'
      ],
      dateColumn: 'entry_date'
    },
    // Wheel Change form (POST /carding/change-control) — writes to carding_change_request
    // (carding.card_change_control / card_change_control_lines are unused legacy tables).
    wheelchange: {
      fromClause: 'carding.carding_change_request',
      selectColumns: [
        'entry_id',
        'type',
        'test_no',
        'entry_date',
        'cdo_no',
        'cdg_no_proposed',
        'mixing_existing',
        'mixing_proposed',
        'blend_percent_existing',
        'blend_percent_proposed',
        'del_hank_existing',
        'del_hank_proposed',
        'feed_weight_existing',
        'feed_weight_proposed',
        'speed_existing',
        'speed_proposed',
        'licker_in_speed_1_existing',
        'licker_in_speed_1_proposed',
        'licker_in_speed_2_existing',
        'licker_in_speed_2_proposed',
        'cylinder_speed_existing',
        'cylinder_speed_proposed',
        'flats_speed_mm_min_existing',
        'flats_speed_mm_min_proposed',
        'feed_plate_to_licker_in_existing',
        'feed_plate_to_licker_in_proposed',
        'sfl_existing',
        'sfl_proposed',
        'sfd_existing',
        'sfd_proposed',
        'cylinder_to_flats_existing',
        'cylinder_to_flats_proposed',
        'cylinder_in_doffer_existing',
        'cylinder_in_doffer_proposed',
        'web_speed_draft_mw_v4_existing',
        'web_speed_draft_mw_v4_proposed',
        'lc_wing_setting_existing',
        'lc_wing_setting_proposed',
        'rr_rk_beater_speed_existing',
        'rr_rk_beater_speed_proposed',
        'remarks',
        'operator',
        'approval_status',
        'created_at'
      ],
      dateColumn: 'entry_date'
    },
    // Individual Card Waste Study form (POST /carding/card-waste-study) — header + two
    // per-row child tables (type_rows, waste_rows) matched up by row_no within the same study.
    // Both child tables have their own "waste_type" column, so the header's is aliased
    // to avoid a name collision in the report output.
    individualcardwastestudy: {
      fromClause: `carding.card_waste_study w
        LEFT JOIN carding.card_waste_study_type_rows t ON t.study_id = w.id
        LEFT JOIN carding.card_waste_study_waste_rows wr ON wr.study_id = w.id AND wr.row_no = t.row_no`,
      selectColumns: [
        'w.entry_id',
        'w.waste_study_id',
        'w.date',
        'w.variety',
        'w.study_type',
        'w.carding_production_kg',
        'w.type_entries',
        'w.waste_type AS study_waste_type',
        'w.waste_kg',
        'w.waste_percent',
        'w.overall_percent',
        'w.remarks',
        't.row_no',
        't.cylinder_speed',
        't.lickerin_speed',
        't.lickerin_speed_1',
        't.lickerin_speed_2',
        't.lickerin_speed_3',
        't.flat_speed',
        't.doffer_speed',
        't.delivery_speed',
        't.wing_setting_1',
        't.wing_setting_2',
        't.mc_no',
        't.mc_production',
        'wr.waste_type AS row_waste_type',
        'wr.waste_kgs_value',
        'wr.waste_kgs_percent'
      ],
      dateColumn: 'w.date'
    }
  }
};

GENERAL_REPORT_CUSTOM_SOURCES.carding.upercentdataentry = GENERAL_REPORT_CUSTOM_SOURCES.carding.udataentry;
GENERAL_REPORT_CUSTOM_SOURCES.carding.cardwastestudy = GENERAL_REPORT_CUSTOM_SOURCES.carding.individualcardwastestudy;
GENERAL_REPORT_CUSTOM_SOURCES.carding.cardwastestudyentry = GENERAL_REPORT_CUSTOM_SOURCES.carding.individualcardwastestudy;
// Frontend has three separate report types "Individual Card Waste Study Type 1/2/3" (they all
// share the same fetcher/endpoint and are distinguished client-side), so all three normalized
// keys need to resolve to the same joined source.
GENERAL_REPORT_CUSTOM_SOURCES.carding.individualcardwastestudytype1 = GENERAL_REPORT_CUSTOM_SOURCES.carding.individualcardwastestudy;
GENERAL_REPORT_CUSTOM_SOURCES.carding.individualcardwastestudytype2 = GENERAL_REPORT_CUSTOM_SOURCES.carding.individualcardwastestudy;
GENERAL_REPORT_CUSTOM_SOURCES.carding.individualcardwastestudytype3 = GENERAL_REPORT_CUSTOM_SOURCES.carding.individualcardwastestudy;
GENERAL_REPORT_CUSTOM_SOURCES.carding.cardingnre = GENERAL_REPORT_CUSTOM_SOURCES.carding.nre;
GENERAL_REPORT_CUSTOM_SOURCES.carding.cardingnrepercent = GENERAL_REPORT_CUSTOM_SOURCES.carding.nre;

GENERAL_REPORT_CUSTOM_SOURCES.carding.carddfkpressurechecking = GENERAL_REPORT_CUSTOM_SOURCES.carding.dfkpressurechecking;
GENERAL_REPORT_CUSTOM_SOURCES.carding.carddfkdata = GENERAL_REPORT_CUSTOM_SOURCES.carding.dfkpressurechecking;
GENERAL_REPORT_CUSTOM_SOURCES.carding.cardthickplaceandcv = GENERAL_REPORT_CUSTOM_SOURCES.carding.cardthickplaceentry;
GENERAL_REPORT_CUSTOM_SOURCES.carding.thickplaceandcv = GENERAL_REPORT_CUSTOM_SOURCES.carding.cardthickplaceentry;
GENERAL_REPORT_CUSTOM_SOURCES.carding.thickplacecv = GENERAL_REPORT_CUSTOM_SOURCES.carding.cardthickplaceentry;
GENERAL_REPORT_CUSTOM_SOURCES.carding.processparameterdataentry = GENERAL_REPORT_CUSTOM_SOURCES.carding.processparameter;
// Frontend's actual labels are "Between & Within Data Entry - Within/Between", which normalize
// to betweenwithindataentrywithin/between — alias onto the existing between/within sources.
GENERAL_REPORT_CUSTOM_SOURCES.carding.betweenwithindataentrybetween = GENERAL_REPORT_CUSTOM_SOURCES.carding.betweencarddataentry;
GENERAL_REPORT_CUSTOM_SOURCES.carding.betweenwithindataentrywithin = GENERAL_REPORT_CUSTOM_SOURCES.carding.withincarddataentry;

// Some report-type labels normalize to more than one plausible key depending on how the
// dropdown phrases them (e.g. "BR CV1M Data Entry Within Lap" vs "BR CV1m Data Entry").
// Alias the extra normalized forms onto the canonical entries above.
GENERAL_REPORT_CUSTOM_SOURCES.blowroom.blowroomsyncdataentry = GENERAL_REPORT_CUSTOM_SOURCES.blowroom.blowroomsync;
GENERAL_REPORT_CUSTOM_SOURCES.blowroom.processparameterdataentry = GENERAL_REPORT_CUSTOM_SOURCES.blowroom.processparameter;
GENERAL_REPORT_CUSTOM_SOURCES.blowroom.brcv1mdataentrywithinlap = GENERAL_REPORT_CUSTOM_SOURCES.blowroom.brcv1mdataentry;
GENERAL_REPORT_CUSTOM_SOURCES.blowroom.withinlapcv = GENERAL_REPORT_CUSTOM_SOURCES.blowroom.brcv1mdataentry;
GENERAL_REPORT_CUSTOM_SOURCES.blowroom.withinlapcvdataentry = GENERAL_REPORT_CUSTOM_SOURCES.blowroom.brcv1mdataentry;
GENERAL_REPORT_CUSTOM_SOURCES.blowroom.brbetweenlapcvdataentry = GENERAL_REPORT_CUSTOM_SOURCES.blowroom.brbetweenlapcv;
GENERAL_REPORT_CUSTOM_SOURCES.blowroom.betweenlapcv = GENERAL_REPORT_CUSTOM_SOURCES.blowroom.brbetweenlapcv;
GENERAL_REPORT_CUSTOM_SOURCES.blowroom.betweenlapcvdataentry = GENERAL_REPORT_CUSTOM_SOURCES.blowroom.brbetweenlapcv;

GENERAL_REPORT_CUSTOM_SOURCES.drawframe = {
  // Draw Frame Cots Data Entry form (POST /drawframe/cots) — header table (sub_type =
  // 'Breaker'/'Finisher') joined to whichever child table matches that scope, same split as
  // Carding's Between/Within Card Data Entry above.
  drawframecotsdataentrybreaker: {
    fromClause: `(SELECT * FROM drawframe.cots_data_entry WHERE sub_type = 'Breaker') e
      LEFT JOIN drawframe.cots_breaker_data d ON d.entry_id = e.id`,
    selectColumns: [
      'e.entry_id',
      'e.entry_date',
      'e.shift',
      'd.mc_name',
      'd.fan_waste',
      'd.cot_change',
      'd.stripper_w',
      'e.created_at'
    ],
    dateColumn: 'e.entry_date'
  },
  drawframecotsdataentryfinisher: {
    fromClause: `(SELECT * FROM drawframe.cots_data_entry WHERE sub_type = 'Finisher') e
      LEFT JOIN drawframe.cots_finisher_data d ON d.entry_id = e.id`,
    selectColumns: [
      'e.entry_id',
      'e.entry_date',
      'e.shift',
      'd.mc_name',
      'd.fan_waste',
      'd.cot_change',
      'd.stripper_w',
      'd.auto_level',
      'd.silver_worn',
      'd.main_tin',
      'd.scanning',
      'e.created_at'
    ],
    dateColumn: 'e.entry_date'
  },
  // PP - Breaker/Finisher Drawing forms both post to /drawframe/header and write to the
  // same drawframe.drawframe_qc_header table, distinguished only by entry_scope
  // ('breaker'/'finisher') — same split pattern as the Cots sources above. (Note:
  // drawframe.finisher_drawing_inspection / POST /drawframe/finisher is an unrelated table/
  // screen, not "PP - Finisher Drawing".)
  ppbreakerdrawing: {
    fromClause: `(SELECT * FROM drawframe.drawframe_qc_header WHERE entry_scope = 'breaker') h`,
    selectColumns: [
      'h.entry_id', 'h.count_name', 'h.consignee_name', 'h.creation_date',
      'h.make', 'h.no_of_ends', 'h.bottom_roll_setting', 'h.breaker_draft',
      'h.total_draft', 'h.hank', 'h.web_tension_draft', 'h.trumpet_size',
      'h.insert_size', 'h.web_funnel_size', 'h.delivery_hank', 'h.delivery_speed',
      'h.pressure_bar', 'h.scanning_rolls_size', 'h.created_at'
    ],
    dateColumn: 'h.creation_date'
  },
  ppfinisherdrawing: {
    fromClause: `(SELECT * FROM drawframe.drawframe_qc_header WHERE entry_scope = 'finisher') h`,
    selectColumns: [
      'h.entry_id', 'h.count_name', 'h.consignee_name', 'h.creation_date',
      'h.make', 'h.no_of_ends', 'h.bottom_roll_setting', 'h.breaker_draft',
      'h.total_draft', 'h.hank', 'h.web_tension_draft', 'h.trumpet_size',
      'h.insert_size', 'h.web_funnel_size', 'h.delivery_hank', 'h.delivery_speed',
      'h.pressure_bar', 'h.scanning_rolls_size', 'h.created_at'
    ],
    dateColumn: 'h.creation_date'
  }
};

// All 7 Wheel Change sub-types share one table (drawframe.wheel_change), distinguished by
// wheel_change_type — filter each report type down to its own sub-type's rows.
const DRAWFRAME_WHEEL_CHANGE_TYPES = {
  wheelchangebreakertype1: 'type1',
  wheelchangebreakertype2: 'type2',
  wheelchangebreakertype3: 'type3',
  wheelchangefinishertype1: 'finisher_type1_lrsb',
  wheelchangefinishertype2: 'type2_d40',
  wheelchangefinishertype3: 'type3_d50_d55',
  wheelchangefinishertype4: 'type4_ldf3s'
};
for (const [reportKey, wheelChangeType] of Object.entries(DRAWFRAME_WHEEL_CHANGE_TYPES)) {
  GENERAL_REPORT_CUSTOM_SOURCES.drawframe[reportKey] = {
    fromClause: `(SELECT * FROM drawframe.wheel_change WHERE wheel_change_type = '${wheelChangeType}') w`,
    selectColumns: [
      'w.entry_id', 'w.type', 'w.line_type', 'w.wheel_change_type_label',
      'w.entry_date', 'w.parameters', 'w.rows', 'w.created_at'
    ],
    dateColumn: 'w.entry_date'
  };
}

const DATE_COLUMN_PREFERENCE = [
  'entry_date', 'inspection_date', 'inspectiondate', 'date', 'created_at', 'createdat', 'createdAt', 'updated_at'
];

const getExistingReportTable = async (candidates = []) => {
  for (const tableName of candidates) {
    const [schemaName, relationName] = String(tableName || '').split('.');
    if (!schemaName || !relationName) continue;
    const result = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
      [schemaName, relationName]
    );
    if (result.rowCount) return `${schemaName}.${relationName}`;
  }
  return '';
};

const getReportTableColumns = async (tableName) => {
  const [schemaName, relationName] = String(tableName || '').split('.');
  if (!schemaName || !relationName) return [];
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schemaName, relationName]
  );
  return result.rows.map((row) => row.column_name);
};

const resolveGeneralReportSource = async ({ department, subDepartment, reportType }) => {
  const departmentKey = normalizeReportKey(subDepartment || department);
  const reportKey = normalizeReportKey(reportType);

  const customSource = (GENERAL_REPORT_CUSTOM_SOURCES[departmentKey] || GENERAL_REPORT_CUSTOM_SOURCES[normalizeReportKey(department)] || {})[reportKey];
  if (customSource) {
    const columns = customSource.selectColumns.map((column) => {
      const aliasMatch = column.match(/\sAS\s+(\w+)\s*$/i);
      return aliasMatch ? aliasMatch[1] : column.split('.').pop();
    });
    return {
      tableName: customSource.fromClause,
      selectList: customSource.selectColumns.join(', '),
      columns,
      dateColumn: customSource.dateColumn || ''
    };
  }

  const departmentSources = GENERAL_REPORT_SOURCE_CANDIDATES[departmentKey] || GENERAL_REPORT_SOURCE_CANDIDATES[normalizeReportKey(department)] || {};
  const candidates = departmentSources[reportKey] || [];
  const tableName = await getExistingReportTable(candidates);
  if (!tableName) return null;
  const columns = await getReportTableColumns(tableName);
  const normalizedColumns = new Map(columns.map((column) => [normalizeReportKey(column), column]));
  const dateColumn = DATE_COLUMN_PREFERENCE.find((column) => columns.includes(column))
    || DATE_COLUMN_PREFERENCE.map(normalizeReportKey).map((key) => normalizedColumns.get(key)).find(Boolean)
    || '';
  return { tableName, columns, dateColumn, selectList: '*' };
};

const fetchGeneralReportRows = async ({ department, subDepartment, reportType, startDate, endDate, page, limit }) => {
  const source = await resolveGeneralReportSource({ department, subDepartment, reportType });
  if (!source) {
    const error = new Error('No data table is configured for the selected general report.');
    error.statusCode = 404;
    throw error;
  }

  const where = [];
  const values = [];
  if (source.dateColumn && startDate) {
    values.push(startDate);
    where.push(`${quoteQualifiedReportIdent(source.dateColumn)} >= $${values.length}`);
  }
  if (source.dateColumn && endDate) {
    values.push(endDate);
    where.push(`${quoteQualifiedReportIdent(source.dateColumn)} <= $${values.length}`);
  }

  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const orderColumn = source.dateColumn || (source.columns.includes('id') ? 'id' : source.columns[0]);
  const tiebreakColumn = source.columns.includes('id') && orderColumn !== 'id' ? 'id' : null;
  const orderBySql = tiebreakColumn
    ? `${quoteQualifiedReportIdent(orderColumn)} DESC, ${quoteQualifiedReportIdent(tiebreakColumn)} DESC`
    : `${quoteQualifiedReportIdent(orderColumn)} DESC`;
  const safeLimit = parsePositiveInteger(limit, 100, 1000);
  const safePage = parsePositiveInteger(page, 1, 100000);
  const offset = (safePage - 1) * safeLimit;

  const countResult = await client.query(`SELECT COUNT(*)::integer AS total FROM ${source.tableName}${whereSql}`, values);
  const rowsResult = await client.query(
    `SELECT ${source.selectList || '*'} FROM ${source.tableName}${whereSql} ORDER BY ${orderBySql} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, safeLimit, offset]
  );

  return {
    data: rowsResult.rows,
    rows: rowsResult.rows,
    count: rowsResult.rowCount,
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    limit: safeLimit,
    source: {
      table: source.tableName,
      dateColumn: source.dateColumn || null
    }
  };
};
const buildReportFromPayload = (payload = {}) => {
  const source = isPlainObject(payload) ? payload : {};
  const report = parseJsonObject(source.report) || {};
  const sourceRows = Array.isArray(source.rows) ? source.rows : parseJsonArray(source.rows);
  const reportRows = Array.isArray(report.rows) ? report.rows : parseJsonArray(report.rows);
  const rows = sourceRows.length ? sourceRows : reportRows;

  return {
    ...report,
    department: source.department || report.department,
    subDepartment: source.subDepartment || report.subDepartment,
    reportType: source.reportType || report.reportType,
    rows,
    totalRows: typeof source.totalRows === 'number'
      ? source.totalRows
      : typeof report.totalRows === 'number'
        ? report.totalRows
        : rows.length
  };
};

router.get('/general-report/options', async (req, res, next) => {
  try {
    const department = normalizeFilterText(req.query.department);
    const subDepartment = normalizeFilterText(req.query.sub_department || req.query.subDepartment);
    const options = await getGeneralReportFilterOptions({ department, subDepartment });

    return res.status(200).json({
      ...options,
      subDepartments: options.sub_departments,
      reportTypes: options.report_types
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/general-report/filters', async (req, res, next) => {
  try {
    const department = normalizeFilterText(req.query.department);
    const subDepartment = normalizeFilterText(req.query.sub_department || req.query.subDepartment);
    const options = await getGeneralReportFilterOptions({ department, subDepartment });

    return res.status(200).json({
      ...options,
      subDepartments: options.sub_departments,
      reportTypes: options.report_types
    });
  } catch (error) {
    return next(error);
  }
});
router.get('/general-report/data', async (req, res, next) => {
  try {
    const department = normalizeFilterText(req.query.department);
    const subDepartment = normalizeFilterText(req.query.sub_department || req.query.subDepartment);
    const reportType = normalizeFilterText(req.query.report_type || req.query.reportType || req.query.input_screen || req.query.inputScreen);

    if (!department || !subDepartment || !reportType) {
      return res.status(400).json({
        message: 'department, subDepartment, and reportType are required'
      });
    }

    const result = await fetchGeneralReportRows({
      department,
      subDepartment,
      reportType,
      startDate: normalizeFilterText(req.query.start_date || req.query.startDate),
      endDate: normalizeFilterText(req.query.end_date || req.query.endDate),
      page: req.query.page,
      limit: req.query.limit
    });

    return res.status(200).json({
      ...result,
      department,
      subDepartment,
      reportType
    });
  } catch (error) {
    return next(error);
  }
});

const buildMailPayloadFromBody = (body = {}, schedule = {}) => {
  const source = isPlainObject(body) ? body : {};
  const mailPayload = parseJsonObject(source.mailPayload);
  const schedulePayload = parseJsonObject(schedule) || {};

  if (isPlainObject(mailPayload)) {
    const payloadSchedule = parseJsonObject(mailPayload.schedule);
    const payloadReport = buildReportFromPayload(mailPayload);
    return {
      ...mailPayload,
      report: payloadReport,
      schedule: {
        ...(payloadSchedule || {}),
        ...schedulePayload
      }
    };
  }

  const report = buildReportFromPayload(source);

  return {
    to: source.to || source.receiverEmail || report.to || report.receiverEmail,
    subject: source.subject || report.subject || 'Scheduled Report',
    html: source.html || report.html,
    department: report.department,
    subDepartment: report.subDepartment,
    reportType: report.reportType,
    rows: report.rows,
    totalRows: report.totalRows,
    report,
    schedule: schedulePayload
  };
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildReportHtml = ({ schedule = {}, report = {}, attachmentFilename = '' }) => {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const tableRows = rows.slice(0, 50).map((row) => `
    <tr>
      ${columns.map((column) => `<td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(row[column])}</td>`).join('')}
    </tr>
  `);

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="margin: 0 0 12px; color: #1f2937;">${escapeHtml(schedule.name || 'Scheduled Report')}</h2>
        <p style="margin: 8px 0;"><strong>Department:</strong> ${escapeHtml(report.department)}</p>
        <p style="margin: 8px 0;"><strong>Report:</strong> ${escapeHtml(report.subDepartment)} - ${escapeHtml(report.reportType)}</p>
        <p style="margin: 8px 0;"><strong>Schedule:</strong> ${escapeHtml(schedule.frequency)} ${escapeHtml(schedule.weekday || '')} at ${escapeHtml(schedule.time)}</p>
        <p style="margin: 8px 0;"><strong>Total rows:</strong> ${escapeHtml(report.totalRows ?? rows.length)}</p>
        <p style="margin: 12px 0 0 0;"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      </div>

      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 12px; margin-bottom: 20px; border-radius: 4px;">
        <p style="margin: 0; color: #047857;">
          <strong>📎 PDF Attachment:</strong> A complete PDF report <strong>${escapeHtml(attachmentFilename)}</strong> is attached to this email. 
          You can download and view it in your email client or save it for later reference.
        </p>
      </div>

      ${
        rows.length
          ? `<div style="margin-top: 20px;">
              <h3 style="margin: 0 0 12px; color: #1f2937;">Report Data Preview (first 50 rows)</h3>
              <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 12px; border-color: #e5e7eb;">
                <thead>
                  <tr style="background-color: #f3f4f6;">
                    ${columns.map((column) => `<th style="padding: 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #d1d5db;">${escapeHtml(column)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${tableRows.join('')}
                </tbody>
              </table>
              ${rows.length > 50 ? `<p style="margin-top: 12px; color: #6b7280; font-size: 11px;">... and ${rows.length - 50} more rows in the complete PDF report</p>` : ''}
            </div>`
          : '<p style="text-align: center; color: #6b7280;">No report rows found for the selected filters.</p>'
      }

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
        <p style="margin: 0;">If you have any questions about this report, please contact your administrator.</p>
      </div>
    </div>
  `;
};

const generateReportPDF = ({ schedule = {}, report = {} }) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 24, size: 'A4' });
      const buffers = [];
      const rows = Array.isArray(report.rows) ? report.rows : [];
      const firstRowColumns = rows.length ? Object.keys(rows[0]) : [];
      const selectedFieldMeta = Array.isArray(schedule.selectedFields)
        ? schedule.selectedFields
            .map((field) => {
              if (typeof field === 'string') {
                const key = field.trim();
                return key ? { key, label: key } : null;
              }
              if (isPlainObject(field)) {
                const key = String(field.key || field.field || '').trim();
                if (!key) return null;
                const label = String(field.label || field.name || key).trim() || key;
                return { key, label };
              }
              return null;
            })
            .filter(Boolean)
        : [];
      const selectedFieldKeys = selectedFieldMeta
        .map((field) => field.key)
        .filter((key) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, key)));
      const columns = [
        ...selectedFieldKeys,
        ...firstRowColumns.filter((column) => !selectedFieldKeys.includes(column))
      ];
      const columnHeaderMap = new Map(selectedFieldMeta.map((field) => [field.key, field.label]));
      const columnLabel = (column) => columnHeaderMap.get(column) || String(column);

      const formatDateRange = () => {
        const start = String(schedule.startDate || report.startDate || '').trim();
        const end = String(schedule.endDate || report.endDate || '').trim();
        if (start && end) return `${start} to ${end}`;
        if (start) return start;
        if (end) return end;
        return '-';
      };

      const toText = (value) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(4).replace(/\.0000$/, '') : '';
        return String(value);
      };

      const isNumericValue = (value) => {
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value !== 'string') return false;
        const trimmed = value.trim();
        return Boolean(trimmed) && /^-?\d+(\.\d+)?$/.test(trimmed);
      };
      const cellPaddingX = 4;
      const cellPaddingY = 3;

      const getInnerCellWidth = (width) => Math.max(8, width - (cellPaddingX * 2));

      const getWrappedTextHeight = (text, width, fontName, fontSize) => {
        const raw = String(text ?? '').trim();
        const safeText = raw || ' ';
        doc.font(fontName).fontSize(fontSize);
        return doc.heightOfString(safeText, {
          width: getInnerCellWidth(width),
          align: 'left',
          lineBreak: true
        });
      };

      const sampleRows = rows.slice(0, 50);
      const columnAlignments = new Map(
        columns.map((column) => {
          let hasValue = false;
          let numericOnly = true;
          for (const row of sampleRows) {
            const value = row[column];
            if (value === null || value === undefined || String(value).trim() === '') continue;
            hasValue = true;
            if (!isNumericValue(value)) {
              numericOnly = false;
              break;
            }
          }
          return [column, hasValue && numericOnly ? 'right' : 'left'];
        })
      );

      const buildColumnWidths = () => {
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const minWidth = 44;
        const rawWidths = columns.map((column) => {
          const headerWidth = Math.max(46, doc.font('Helvetica-Bold').fontSize(6.8).widthOfString(columnLabel(column)));
          let maxWidth = headerWidth;
          for (const row of sampleRows) {
            const valueWidth = doc.font('Helvetica').fontSize(6.4).widthOfString(toText(row[column]));
            if (valueWidth > maxWidth) maxWidth = valueWidth;
          }
          return Math.max(minWidth, Math.min(maxWidth + 12, 136));
        });

        const sum = rawWidths.reduce((acc, width) => acc + width, 0);
        if (!sum) return [];

        if (sum > pageWidth) {
          const scale = pageWidth / sum;
          return rawWidths.map((width) => Math.max(26, width * scale));
        }

        const extra = (pageWidth - sum) / rawWidths.length;
        return rawWidths.map((width) => width + extra);
      };

      const drawTopHeader = () => {
        const title = schedule.name || 'Scheduled Report';
        const metaX = doc.page.margins.left;
        const startY = doc.page.margins.top;

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937')
          .text(title, doc.page.margins.left, startY, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            align: 'center'
          });

        const metaLines = [
          `Department: ${report.department || schedule.department || '-'}`,
          `Sub Department: ${report.subDepartment || schedule.subDepartment || '-'}`,
          `Type: ${report.reportType || schedule.reportType || '-'}`,
          `Date Range: ${formatDateRange()}`,
          `Total Rows: ${report.totalRows ?? rows.length ?? 0}`
        ];

        let y = startY + 24;
        doc.font('Helvetica').fontSize(7).fillColor('#111827');
        for (const line of metaLines) {
          doc.text(line, metaX, y, { align: 'left' });
          y += 10;
        }

        const dividerY = y + 4;
        doc.moveTo(doc.page.margins.left, dividerY)
          .lineTo(doc.page.width - doc.page.margins.right, dividerY)
          .strokeColor('#d1d5db')
          .lineWidth(0.8)
          .stroke();
        return dividerY + 8;
      };

      const drawTableHeader = (y, columnWidths) => {
        const rowHeight = Math.max(
          18,
          Math.ceil(
            columns.reduce((maxHeight, column, index) => {
              const cellHeight = getWrappedTextHeight(columnLabel(column), columnWidths[index], 'Helvetica-Bold', 6.8);
              return Math.max(maxHeight, cellHeight);
            }, 0) + (cellPaddingY * 2)
          )
        );
        let x = doc.page.margins.left;

        for (let i = 0; i < columns.length; i += 1) {
          const width = columnWidths[i];
          doc.rect(x, y, width, rowHeight)
            .fillAndStroke('#f3f4f6', '#d1d5db');
          doc.font('Helvetica-Bold')
            .fontSize(6.8)
            .fillColor('#374151')
            .text(columnLabel(columns[i]), x + cellPaddingX, y + cellPaddingY, {
              width: getInnerCellWidth(width),
              align: 'left',
              lineBreak: true
            });
          x += width;
        }
        return y + rowHeight;
      };

      const getRowHeight = (row, columnWidths) =>
        Math.max(
          16,
          Math.ceil(
            columns.reduce((maxHeight, col, index) => {
              const cellHeight = getWrappedTextHeight(toText(row[col]), columnWidths[index], 'Helvetica', 6.2);
              return Math.max(maxHeight, cellHeight);
            }, 0) + (cellPaddingY * 2)
          )
        );

      const drawTableRow = (row, y, columnWidths, rowIndex, rowHeight) => {
        let x = doc.page.margins.left;
        const rowFill = rowIndex % 2 === 0 ? '#ffffff' : '#f9fafb';

        for (let i = 0; i < columns.length; i += 1) {
          const col = columns[i];
          const width = columnWidths[i];
          doc.rect(x, y, width, rowHeight)
            .fillAndStroke(rowFill, '#e5e7eb');
          doc.font('Helvetica')
            .fontSize(6.2)
            .fillColor('#111827')
            .text(toText(row[col]), x + cellPaddingX, y + cellPaddingY, {
              width: getInnerCellWidth(width),
              align: columnAlignments.get(col) || 'left',
              lineBreak: true
            });
          x += width;
        }
        return y + rowHeight;
      };

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        console.log(`PDF generated successfully. Size: ${pdfBuffer.length} bytes`);
        resolve(pdfBuffer);
      });
      doc.on('error', (err) => {
        console.error('PDF generation error:', err);
        reject(err);
      });

      if (!rows.length || !columns.length) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827')
          .text(schedule.name || 'Scheduled Report', { align: 'center' });
        doc.moveDown(1);
        doc.font('Helvetica').fontSize(10).text('No report rows found for the selected filters.', { align: 'center' });
        doc.end();
        return;
      }

      const columnWidths = buildColumnWidths();
      let cursorY = drawTopHeader();
      cursorY = drawTableHeader(cursorY, columnWidths);

      const tableBottomLimit = doc.page.height - doc.page.margins.bottom - 12;
      for (let index = 0; index < rows.length; index += 1) {
        const rowHeight = getRowHeight(rows[index], columnWidths);

        if (cursorY + rowHeight > tableBottomLimit) {
          doc.addPage();
          cursorY = doc.page.margins.top;
          cursorY = drawTableHeader(cursorY, columnWidths);
        }
        cursorY = drawTableRow(rows[index], cursorY, columnWidths, index, rowHeight);
      }

      doc.end();
    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
};
const getTransporter = () =>
  nodemailer.createTransport({
    service: process.env.REPORT_EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.REPORT_SMTP_USER || process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.REPORT_SMTP_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS
    }
  });

const encodeAttachmentForResend = (attachment = {}) => {
  const filename = String(attachment.filename || 'attachment.bin');
  const contentType = String(attachment.contentType || 'application/octet-stream');
  const data = Buffer.isBuffer(attachment.content)
    ? attachment.content
    : Buffer.from(String(attachment.content || ''), 'utf8');
  return {
    filename,
    content: data.toString('base64'),
    content_type: contentType
  };
};

const sendWithResend = async (mailOptions) => {
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is missing. Configure it in backend environment variables.');
  }

  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Use Node.js 18+ to send mail with Resend.');
  }

  validateResendFromAddress(mailOptions.from);
  const payload = {
    from: mailOptions.from,
    to: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text
  };

  if (Array.isArray(mailOptions.attachments) && mailOptions.attachments.length) {
    payload.attachments = mailOptions.attachments.map(encodeAttachmentForResend);
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'spintelligence-backend/1.0'
    },
    body: JSON.stringify(payload)
  });

  const rawBody = await response.text();
  let parsedBody = {};
  try {
    parsedBody = JSON.parse(rawBody);
  } catch (_) {
    // Keep raw text fallback below.
  }

  if (!response.ok) {
    const detail = parsedBody.message || parsedBody.error || rawBody || 'Unknown Resend API error';
    const error = new Error(`Resend API ${response.status}: ${detail}`);
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  return { messageId: parsedBody.id || 'resend:accepted' };
};

const sendReportMail = async (payload = {}) => {
  const normalizedPayload = parseJsonObject(payload) || (isPlainObject(payload) ? payload : {});
  const nestedMailPayload = parseJsonObject(normalizedPayload.mailPayload);
  const mailPayload = nestedMailPayload
    ? {
        ...nestedMailPayload,
        schedule: parseJsonObject(normalizedPayload.schedule) || parseJsonObject(nestedMailPayload.schedule),
        report: parseJsonObject(normalizedPayload.report) || parseJsonObject(nestedMailPayload.report)
      }
    : normalizedPayload;
  const schedule = parseJsonObject(mailPayload.schedule) || {};
  const report = buildReportFromPayload(mailPayload);
  const smtpUser = process.env.REPORT_SMTP_USER || process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.REPORT_SMTP_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
  const useResend = isResendEnabled();

  if (!useResend && (!smtpUser || !smtpPass)) {
    throw new Error('SMTP credentials missing. Add EMAIL_USER and EMAIL_PASS in backend .env.');
  }

  const to = normalizeRecipients(mailPayload.to || mailPayload.receiverEmail);
  const subject = mailPayload.subject || 'Scheduled Report';

  if (!to.length) {
    throw new Error('At least one recipient email is required to send a report.');
  }

  // Generate PDF attachment
  let pdfBuffer;
  let filename;

  try {
    console.log('Generating PDF for report:', schedule.name || 'Unknown');
    pdfBuffer = await generateReportPDF({ schedule, report });

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }

    const reportName = schedule.name || 'report';
    const timestamp = new Date().toISOString().split('T')[0];
    filename = `${reportName.replace(/\s+/g, '_')}_${timestamp}.pdf`;

    console.log(`PDF generated successfully: ${filename} (${pdfBuffer.length} bytes)`);
  } catch (error) {
    console.error('Error generating PDF:', error.message);
    throw new Error(`Failed to generate PDF report: ${error.message}`);
  }

  // Build HTML with attachment filename reference
  const html = mailPayload.html || buildReportHtml({ schedule, report, attachmentFilename: filename });

  const fromCandidate = useResend
    ? (process.env.REPORT_FROM_EMAIL || mailPayload.from || defaultSenderEmail)
    : (mailPayload.from || smtpUser || defaultSenderEmail);

  const mailOptions = {
    from: buildFromAddress(fromCandidate),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: `Please find attached the scheduled report PDF: ${schedule.name || 'Scheduled Report'}.`,
    attachments: [
      {
        filename,
        content: Buffer.from(pdfBuffer),
        contentType: 'application/pdf',
        contentDisposition: 'attachment'
      }
    ]
  };

  try {
    console.log(`Sending email with PDF to: ${JSON.stringify(mailOptions.to)}`);
    console.log(`Attachment: ${filename} (${pdfBuffer.length} bytes)`);

    const info = useResend
      ? await sendWithResend(mailOptions)
      : await getTransporter().sendMail(mailOptions);

    console.log('Report email sent successfully');
    console.log(`  - Provider: ${useResend ? 'resend' : 'smtp'}`);
    console.log(`  - To: ${mailOptions.to.join(', ')}`);
    console.log(`  - Subject: ${subject}`);
    console.log(`  - Attachment: ${filename}`);
    console.log(`  - Message ID: ${info.messageId}`);

    return {
      messageId: info.messageId,
      provider: useResend ? 'resend' : 'smtp',
      to: mailOptions.to,
      attachment: filename
    };
  } catch (error) {
    console.error('Error sending email:', error.message);
    throw error;
  }
};
const rowToSchedule = (row) => {
  const rawSchedule = isPlainObject(row.schedule) ? row.schedule : {};
  const { timezone: _legacyTimeZone, ...scheduleWithoutLegacyTimezone } = rawSchedule;
  const timeZone = resolveScheduleTimeZone(rawSchedule);

  return {
    ...scheduleWithoutLegacyTimezone,
    timeZone,
    id: row.id,
    active: row.active,
    lastAutoSentKey: row.last_auto_sent_key || rawSchedule.lastAutoSentKey || '',
    lastSentAt: row.last_sent_at || rawSchedule.lastSentAt || '',
    createdAt: row.created_at || rawSchedule.createdAt || '',
    updatedAt: row.updated_at || rawSchedule.updatedAt || ''
  };
};

const upsertSchedule = async ({ schedule, mailPayload }) => {
  console.log('upsertSchedule called with:', { schedule, mailPayload });
  const normalizedScheduleInput = parseJsonObject(schedule) || (isPlainObject(schedule) ? schedule : null);
  const normalizedMailPayloadInput = parseJsonObject(mailPayload) || (isPlainObject(mailPayload) ? mailPayload : null);

  if (!normalizedScheduleInput) {
    return { error: { status: 400, message: 'schedule is required and must be an object' } };
  }

  const mailPayloadForSave = normalizedMailPayloadInput || buildMailPayloadFromBody(
    { schedule: normalizedScheduleInput },
    normalizedScheduleInput
  );
  console.log('Validation passed, proceeding with upsert...');

  const id = String(normalizedScheduleInput.id || Date.now()).trim();
  if (!id) {
    return { error: { status: 400, message: 'schedule id is required' } };
  }

  const active = normalizedScheduleInput.active !== false;
  const normalizedSchedule = normalizeSchedule(normalizedScheduleInput, id, active);
  const normalizedPayload = {
    ...mailPayloadForSave,
    schedule: {
      ...(isPlainObject(mailPayloadForSave.schedule) ? mailPayloadForSave.schedule : {}),
      ...normalizedSchedule
    }
  };

  await ensureReportSchedulesTable();

  const result = await client.query(
    `INSERT INTO reports.report_schedules
      (id, schedule, mail_payload, active, frequency, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, now())
     ON CONFLICT (id)
     DO UPDATE SET schedule = EXCLUDED.schedule,
                   mail_payload = EXCLUDED.mail_payload,
                   active = EXCLUDED.active,
                   frequency = EXCLUDED.frequency,
                   updated_at = now()
     RETURNING *`,
    [
      id,
      JSON.stringify(normalizedSchedule),
      JSON.stringify(normalizedPayload),
      active,
      normalizedSchedule.frequency || null
    ]
  );

  return { data: rowToSchedule(result.rows[0]) };
};

const sendStoredSchedule = async (id, { automatic = false, occurrenceKey = '', mailPayload = null } = {}) => {
  await ensureReportSchedulesTable();

  const result = await client.query(
    `SELECT *
     FROM reports.report_schedules
     WHERE id = $1`,
    [id]
  );

  if (!result.rows.length) {
    return { error: { status: 404, message: 'Schedule not found' } };
  }

  const row = result.rows[0];
  const schedule = rowToSchedule(row);

  if (!schedule.active) {
    return { error: { status: 400, message: 'Activate the schedule before sending the report.' } };
  }

  const now = new Date();
  const dedupeWindowSeconds = Number(process.env.REPORT_SEND_DEDUP_SECONDS || 120);
  const currentOccurrenceKey = occurrenceKey || getScheduleOccurrenceKey(schedule, now);

  if (currentOccurrenceKey) {
    const alreadySentForOccurrence =
      row.last_auto_sent_key === currentOccurrenceKey || schedule.lastAutoSentKey === currentOccurrenceKey;
    if (alreadySentForOccurrence) {
      return {
        error: {
          status: 409,
          message: 'This schedule occurrence was already sent. It will not be sent again.'
        }
      };
    }
  }

  if (inFlightScheduleSends.has(id)) {
    return {
      error: {
        status: 409,
        message: 'This schedule is already being sent. Please wait for the current send to finish.'
      }
    };
  }

  inFlightScheduleSends.add(id);
  try {
    if (Number.isFinite(dedupeWindowSeconds) && dedupeWindowSeconds > 0) {
      const claimResult = await client.query(
        `UPDATE reports.report_schedules
         SET last_sent_at = now(),
             updated_at = now()
         WHERE id = $1
           AND (
             last_sent_at IS NULL
             OR last_sent_at < now() - make_interval(secs => $2::int)
           )
         RETURNING id`,
        [id, Math.floor(dedupeWindowSeconds)]
      );

      if (!claimResult.rows.length) {
        return {
          error: {
            status: 409,
            message: `This report was already sent recently. Please wait ${dedupeWindowSeconds} seconds before retrying.`
          }
        };
      }
    }

    const payload = mailPayload || row.mail_payload;
    const sendResult = await sendReportMail(payload);

    if (schedule.frequency === 'Single Time') {
      await client.query(`DELETE FROM reports.report_schedules WHERE id = $1`, [id]);
      return { data: { deleted: true, schedule, ...sendResult } };
    }

    const nextSchedule = {
      ...schedule,
      lastAutoSentKey: (automatic || currentOccurrenceKey) ? currentOccurrenceKey : schedule.lastAutoSentKey,
      lastSentAt: new Date().toISOString()
    };

    const updateResult = await client.query(
      `UPDATE reports.report_schedules
       SET schedule = $2::jsonb,
           mail_payload = $3::jsonb,
           last_auto_sent_key = $4,
           last_sent_at = now(),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        JSON.stringify(nextSchedule),
        JSON.stringify(payload),
        nextSchedule.lastAutoSentKey || null
      ]
    );

    return { data: { schedule: rowToSchedule(updateResult.rows[0]), ...sendResult } };
  } finally {
    inFlightScheduleSends.delete(id);
  }
};

router.get('/schedules', async (req, res, next) => {
  try {
    await ensureReportSchedulesTable();
    const result = await client.query(`
      SELECT *
      FROM reports.report_schedules
      ORDER BY created_at DESC
    `);

    res.json({ schedules: result.rows.map(rowToSchedule) });
  } catch (error) {
    next(error);
  }
});

router.post('/schedules', async (req, res, next) => {
  try {
    const body = req.body || {};
    const requestMailPayload = parseJsonObject(body.mailPayload);
    const schedule = parseJsonObject(body.schedule) || parseJsonObject(requestMailPayload?.schedule);
    const result = await upsertSchedule({
      schedule,
      mailPayload: buildMailPayloadFromBody(body, schedule)
    });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    res.status(201).json({ schedule: result.data });
  } catch (error) {
    next(error);
  }
});

router.put('/schedules/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    const requestMailPayload = parseJsonObject(body.mailPayload);
    const schedule = {
      ...(parseJsonObject(body.schedule) || parseJsonObject(requestMailPayload?.schedule) || {}),
      id: req.params.id
    };
    const result = await upsertSchedule({
      schedule,
      mailPayload: buildMailPayloadFromBody(body, schedule)
    });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    res.json({ schedule: result.data });
  } catch (error) {
    next(error);
  }
});

router.patch('/schedules/:id/status', async (req, res, next) => {
  try {
    await ensureReportSchedulesTable();
    const active = req.body?.active !== false;
    const result = await client.query(
      `UPDATE reports.report_schedules
       SET active = $2,
           schedule = jsonb_set(schedule, '{active}', to_jsonb($2::boolean), true),
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, active]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    res.json({ schedule: rowToSchedule(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/schedules/:id', async (req, res, next) => {
  try {
    await ensureReportSchedulesTable();
    await client.query(`DELETE FROM reports.report_schedules WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/schedules/:id/send', async (req, res, next) => {
  try {
    const result = await sendStoredSchedule(req.params.id, {
      mailPayload: parseJsonObject(req.body?.mailPayload) || null
    });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    res.json({ message: 'Scheduled report email sent.', ...result.data });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
});

router.post('/schedule-email', async (req, res, next) => {
  try {
    const body = req.body || {};
    console.log('Received request body:', JSON.stringify(body, null, 2));

    const requestMailPayload = parseJsonObject(body.mailPayload);
    const schedule = parseJsonObject(body.schedule) || parseJsonObject(requestMailPayload?.schedule);
    console.log('Extracted schedule:', schedule);

    if (isPlainObject(schedule)) {
      // For scheduling reports (creating/updating schedules)
      const mailPayload = buildMailPayloadFromBody(body, schedule);
      console.log('Built mailPayload:', JSON.stringify(mailPayload, null, 2));

      const result = await upsertSchedule({
        schedule,
        mailPayload
      });

      if (result.error) {
        return res.status(result.error.status).json({ message: result.error.message });
      }

      return res.status(201).json({
        message: 'Report email scheduled.',
        schedule: result.data
      });
    }

    // For immediate sending (no schedule provided)
    console.log('No schedule provided, sending immediately...');
    const result = await sendReportMail(body);
    res.json({ message: 'Scheduled report email sent.', ...result });
  } catch (error) {
    console.error('Error in /schedule-email:', error);
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
});

const runDueSchedules = async () => {
  if (workerRunning) return;
  workerRunning = true;

  try {
    await ensureReportSchedulesTable();
    const now = new Date();
    const intervalMs = Number.isFinite(workerIntervalMs) && workerIntervalMs > 0 ? workerIntervalMs : 60000;
    const previousRun = workerLastRunAt || new Date(now.getTime() - Math.max(intervalMs, 60000));
    const result = await client.query(`
      SELECT *
      FROM reports.report_schedules
      WHERE active = true
      ORDER BY created_at ASC
    `);

    for (const row of result.rows) {
      const schedule = rowToSchedule(row);
      const occurrenceKey = findDueOccurrenceKeyInWindow(schedule, previousRun, now);
      if (!occurrenceKey) continue;
      if (row.last_auto_sent_key === occurrenceKey || schedule.lastAutoSentKey === occurrenceKey) continue;

      try {
        const sendResult = await sendStoredSchedule(row.id, {
          automatic: true,
          occurrenceKey
        });
        if (sendResult?.error && sendResult.error.status !== 409) {
          console.error(`Scheduled report ${row.id} skipped: ${sendResult.error.message}`);
        }
      } catch (error) {
        console.error(`Scheduled report ${row.id} failed:`, error.message);
      }
    }
  } catch (error) {
    console.error('Report schedule worker failed:', error.message);
  } finally {
    workerLastRunAt = new Date();
    workerRunning = false;
  }
};

const getNextWorkerDelay = (date = new Date()) => {
  const intervalMs = Number.isFinite(workerIntervalMs) && workerIntervalMs > 0
    ? workerIntervalMs
    : 60000;
  const elapsedInInterval = date.getTime() % intervalMs;
  return elapsedInInterval === 0 ? 0 : intervalMs - elapsedInInterval;
};

const scheduleNextWorkerRun = () => {
  workerTimer = setTimeout(async () => {
    await runDueSchedules();
    scheduleNextWorkerRun();
  }, getNextWorkerDelay());
};

const startReportScheduleWorker = () => {
  if (workerStarted) return;

  const workerEnabled = String(process.env.REPORT_SCHEDULE_WORKER_ENABLED || 'true')
    .trim()
    .toLowerCase() !== 'false';
  if (!workerEnabled) {
    console.log('Report schedule worker is disabled (REPORT_SCHEDULE_WORKER_ENABLED=false).');
    return;
  }

  workerStarted = true;
  workerLastRunAt = new Date();
  if (workerTimer) clearTimeout(workerTimer);
  scheduleNextWorkerRun();
};

module.exports = {
  router,
  startReportScheduleWorker
};



