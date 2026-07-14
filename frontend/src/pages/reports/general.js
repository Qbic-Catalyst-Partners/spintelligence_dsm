import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/router";
import { FiFileText, FiChevronDown, FiCalendar } from "react-icons/fi";

import styles from "@/styles/reports.module.css";
import {
  fetchRowsForDashboardWidget,
  filterRowsByDateRange,
  getDashboardFieldValue,
  getDashboardRowDate,
} from "@/utils/dashboardWidgets";
import { departmentDirectory } from "@/views/departments/data";
import { getThresholdFieldsForScreen } from "@/views/thresholds/fieldCatalog";
import { getThresholdScreensForSubDepartment } from "@/views/thresholds/screenCatalog";

const ALL_TYPES_VALUE = "__all_types__";
const today = new Date();
const padDatePart = (value) => String(value).padStart(2, "0");
const toInputDate = (date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
const toDisplayDate = (value) => {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
};

const titleCase = (value) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());

const normalizeLookup = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const inferFields = (rows) =>
  Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .flatMap((row) => Object.keys(row || {}))
        .filter((key) => !["id", "_id", "__v", "created_at", "updated_at"].includes(key))
    )
  ).map((key) => ({ key, label: titleCase(key) }));

const toField = (fieldName) => {
  const label = String(fieldName || "").trim();
  return label ? { key: label, label } : null;
};

const withDropTestTuftCounts = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const countByDropId = new Map();
  list.forEach((row) => {
    const dropId = row?.drop_id;
    if (!dropId) return;
    countByDropId.set(dropId, (countByDropId.get(dropId) || 0) + 1);
  });
  if (!countByDropId.size) return list;
  return list.map((row) =>
    row?.drop_id ? { ...row, num_tufts: countByDropId.get(row.drop_id) } : row
  );
};

const buildRowGroups = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const groups = [];
  const indexByKey = new Map();

  list.forEach((row) => {
    const key = row?.header_id ?? row?.entry_id ?? row?.id;
    if (key === undefined || key === null) {
      groups.push([row]);
      return;
    }
    if (indexByKey.has(key)) {
      groups[indexByKey.get(key)].push(row);
      return;
    }
    indexByKey.set(key, groups.length);
    groups.push([row]);
  });

  return groups;
};

const isMergedReportField = () => false;

const THICK_PLACE_CV_SCREEN_NAME = "Thick place & CV";

const pivotThickPlaceCvRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const groups = new Map();
  const machineOrder = [];

  list.forEach((row) => {
    if (!row || typeof row !== "object") return;
    const groupKey = row.header_id ?? row.entry_id ?? row.id;
    const machine = row.machine ?? row.machine_name ?? row.machineName;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { ...row });
    }
    if (!machine) return;
    if (!machineOrder.includes(machine)) machineOrder.push(machine);

    const merged = groups.get(groupKey);
    merged[`${machine}::cv_value`] = row.cv_value ?? row.cv1;
    merged[`${machine}::cv_5m_value`] = row.cv_5m_value ?? row.cv_5m ?? row.cv2;
  });

  machineOrder.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  const pivotedRows = Array.from(groups.values());
  const pivotedFields = machineOrder.flatMap((machine) => [
    { key: `${machine}::cv_value`, label: `${machine} - Card Thick Place Value` },
    { key: `${machine}::cv_5m_value`, label: `${machine} - 5m CV` },
  ]);

  return { pivotedRows, pivotedFields };
};

const fieldsFromPivotedRows = (rows) => {
  const machineOrder = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!key.endsWith("::cv_value")) return;
      const machine = key.slice(0, -"::cv_value".length);
      if (!machineOrder.includes(machine)) machineOrder.push(machine);
    });
  });
  machineOrder.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  return machineOrder.flatMap((machine) => [
    { key: `${machine}::cv_value`, label: `${machine} - Card Thick Place Value` },
    { key: `${machine}::cv_5m_value`, label: `${machine} - 5m CV` },
  ]);
};

const SAMPLE_PIVOT_SCREEN_NAMES = new Set([
  "Ribbon Lap CV1M Data Entry",
  "B/R CV1M Data Entry Within Lap",
  "B/R Between Lap CV%",
]);

const getSamplesArray = (row) => {
  const raw = row?.samples;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getSampleScalarValue = (sample) => {
  if (sample && typeof sample === "object") return sample.value ?? sample.sample_value ?? null;
  return sample;
};

const pivotSampleRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const groups = buildRowGroups(list);
  let maxSampleCount = 0;

  const pivotedRows = groups.map((group) => {
    const [firstRow] = group;
    if (!firstRow || typeof firstRow !== "object") return firstRow;

    const ownSamples = getSamplesArray(firstRow);
    const samples = ownSamples.length
      ? ownSamples
      : group
          .filter((row) => row?.sample_no !== undefined && row?.sample_no !== null)
          .sort((a, b) => Number(a.sample_no) - Number(b.sample_no));
    if (samples.length > maxSampleCount) maxSampleCount = samples.length;

    const pivoted = { ...firstRow };
    samples.forEach((sample, index) => {
      pivoted[`sample::${index + 1}`] = getSampleScalarValue(sample);
    });
    return pivoted;
  });

  const pivotedFields = Array.from({ length: maxSampleCount }, (_, index) => ({
    key: `sample::${index + 1}`,
    label: `Sample ${index + 1}`,
  }));

  return { pivotedRows, pivotedFields };
};

const fieldsFromSamplePivotedRows = (rows) => {
  let maxPosition = 0;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      const match = /^sample::(\d+)$/.exec(key);
      if (match) maxPosition = Math.max(maxPosition, Number(match[1]));
    });
  });
  return Array.from({ length: maxPosition }, (_, index) => ({
    key: `sample::${index + 1}`,
    label: `Sample ${index + 1}`,
  }));
};

const COMBER_NOLIS_SCREEN_NAME = "Comber Nolis %";
const NOILS_PERCENT_KEYS = ["Noils %", "noils_percent", "Nolis %"];

const getNoilsPercentValue = (row) => {
  if (!row || typeof row !== "object") return undefined;
  const matchedKey = Object.keys(row).find((key) => NOILS_PERCENT_KEYS.includes(key));
  return matchedKey ? row[matchedKey] : undefined;
};

const pivotComberNolisRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const groups = buildRowGroups(list);
  let maxSampleCount = 0;

  const pivotedRows = groups.map((group) => {
    const [firstRow] = group;
    if (!firstRow || typeof firstRow !== "object") return firstRow;

    const sampleGroup = group.filter((row) => getNoilsPercentValue(row) !== undefined);
    if (sampleGroup.length > maxSampleCount) maxSampleCount = sampleGroup.length;

    const pivoted = { ...firstRow };
    sampleGroup.forEach((row, index) => {
      pivoted[`noils_percent::${index + 1}`] = getNoilsPercentValue(row);
    });
    return pivoted;
  });

  const pivotedFields = Array.from({ length: maxSampleCount }, (_, index) => ({
    key: `noils_percent::${index + 1}`,
    label: `Noils % ${index + 1}`,
  }));

  return { pivotedRows, pivotedFields };
};

const fieldsFromComberNolisPivotedRows = (rows) => {
  let maxPosition = 0;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      const match = /^noils_percent::(\d+)$/.exec(key);
      if (match) maxPosition = Math.max(maxPosition, Number(match[1]));
    });
  });
  return Array.from({ length: maxPosition }, (_, index) => ({
    key: `noils_percent::${index + 1}`,
    label: `Noils % ${index + 1}`,
  }));
};

const NATI_DATA_ENTRY_SCREEN_NAME = "Nati Data Entry";
const NATI_ENTRY_FIELD_LABELS = [
  { key: "mc_no", label: "MC No" },
  { key: "ratio_size_1", label: "Ratio into size-1.0" },
  { key: "ratio_size_07", label: "Ratio into size-0.7" },
  { key: "ratio_size_05", label: "Ratio into size-0.5" },
];

const pivotNatiDataEntryRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const groups = buildRowGroups(list);
  let maxEntryCount = 0;

  const pivotedRows = groups.map((group) => {
    const [firstRow] = group;
    if (!firstRow || typeof firstRow !== "object") return firstRow;

    const entries = Array.isArray(firstRow.entries) ? firstRow.entries : group;
    if (entries.length > maxEntryCount) maxEntryCount = entries.length;

    const pivoted = { ...firstRow, number_of_entries: firstRow.number_of_entries ?? entries.length };
    entries.forEach((entry, index) => {
      const position = index + 1;
      NATI_ENTRY_FIELD_LABELS.forEach(({ key }) => {
        pivoted[`${key}::${position}`] = entry?.[key];
      });
    });
    return pivoted;
  });

  const pivotedFields = Array.from({ length: maxEntryCount }, (_, index) => index + 1).flatMap((position) =>
    NATI_ENTRY_FIELD_LABELS.map(({ key, label }) => ({ key: `${key}::${position}`, label: `${label} -${position}` }))
  );

  return { pivotedRows, pivotedFields };
};

const fieldsFromNatiPivotedRows = (rows) => {
  let maxPosition = 0;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      const match = /^mc_no::(\d+)$/.exec(key);
      if (match) maxPosition = Math.max(maxPosition, Number(match[1]));
    });
  });
  return Array.from({ length: maxPosition }, (_, index) => index + 1).flatMap((position) =>
    NATI_ENTRY_FIELD_LABELS.map(({ key, label }) => ({ key: `${key}::${position}`, label: `${label} -${position}` }))
  );
};

const BETWEEN_WITHIN_CARD_SCREEN_NAME = "Between & Within Card Data Entry";

const BETWEEN_WITHIN_CARD_FIELDS = [
  { key: "id", label: "Test ID" },
  { key: "mc_name", label: "MC Name" },
  { key: "inspection_type", label: "Inspection Type" },
  { key: "num_entries", label: "Number of Entries (N)" },
  { key: "sw_avg", label: "Sample Weight Calculations - Avg" },
  { key: "sw_max", label: "Sample Weight Calculations - Max" },
  { key: "sw_min", label: "Sample Weight Calculations - Min" },
  { key: "sw_range", label: "Sample Weight Calculations - Range" },
  { key: "sw_sd", label: "Sample Weight Calculations - SD" },
  { key: "sw_cv", label: "Sample Weight Calculations - CV" },
  { key: "h_avg", label: "Hank Calculations - Avg" },
  { key: "h_max", label: "Hank Calculations - Max" },
  { key: "h_min", label: "Hank Calculations - Min" },
  { key: "h_range", label: "Hank Calculations - Range" },
  { key: "h_sd", label: "Hank Calculations - SD" },
  { key: "h_cv", label: "Hank Calculations - CV" },
];

const getFieldsForBetweenWithinCard = () => uniqueReportFields(BETWEEN_WITHIN_CARD_FIELDS);

const REPORT_FIELD_ALIASES = {
  "Created At": ["createdAt", "created_on", "createdOn", "created_date", "createdDate", "inserted_at", "insertedAt", "created"],
  "Entry ID": [
    "entryId",
    "entry_no",
    "entryNo",
    "entry_code",
    "entryCode",
    "record_id",
    "recordId",
    "reference_id",
    "referenceId",
    "afis_id",
    "afisId",
    "fibre_id",
    "fibreId",
    "moisture_id",
    "moistureId",
  ],
  "Line No": ["line_no", "lineNo"],
  "Checked By": ["checked_by", "checkedBy"],
  "Number of Rows (N)": ["entries", "num_rows", "numRows"],
  "Run Time (Seconds)": ["value_a"],
  "Idle Time (Seconds)": ["value_b"],
  "Sub Total Time": ["value_c"],
  "Sync Percentage (%)": ["sync_percentage", "syncPercentage"],
  "Grand Total Time (HH:MM:SS)": ["total_time", "totalTime"],
  "Carding Production (KGs)": ["carding_production_kg", "cardingProductionKg", "cardingProduction", "carding_production"],
  "Cylinder Speed": ["cylinder_speed", "cylinderSpeed"],
  "Lickerin Speed": ["lickerin_speed", "lickerinSpeed"],
  "Flat Speed": ["flat_speed", "flatSpeed"],
  "Doffer Speed": ["doffer_speed", "dofferSpeed"],
  "Delivery Speed": ["delivery_speed", "deliverySpeed"],
  "Wing Setting": ["wing_setting_1", "wingSetting"],
  "Wing Settling 1": ["wing_setting_1", "wingSettling1"],
  "Wing Settling 2": ["wing_setting_2", "wingSettling2"],
  "1st Lickerin Speed": ["lickerin_speed_1", "firstLickerinSpeed"],
  "2nd Lickerin Speed": ["lickerin_speed_2", "secondLickerinSpeed"],
  "3rd Lickerin Speed": ["lickerin_speed_3", "thirdLickerinSpeed"],
  "MC No": ["mc_no", "mcNo"],
  "Draft": ["draft_speed", "draftSpeed"],
  "Tension Draft": ["tension_draft", "tensionDraft"],
  "Delivery Hank": ["delivery_hank", "deliveryHank"],
  "Feed Roll to Lickerin": ["feed_roll_to_lickerin", "feedRollToLickerin"],
  "Lickerin to Cylinder": ["lickerin_to_cylinder", "lickerinToCylinder"],
  "Cylinder to Flats": ["cylinder_to_flats", "cylinderToFlats"],
  "Cylinder to Doffer": ["cylinder_to_doffer", "cylinderToDoffer"],
  "SFL": ["sfl"],
  "SFD": ["sfd"],
  "Lickerin": ["lickerin"],
  "Cylinder": ["cylinder"],
  "Doffer": ["doffer"],
  "Flats": ["flats"],
  "Card Thick Place Value": ["cv_value", "cv1"],
  "5m CV": ["cv_5m_value", "cv_5m", "cv2"],
  "Cylinder Wire Specification - Specs": ["cylinder_specs", "cylinderSpecs"],
  "Cylinder Wire Specification - Tonnage in Kgs (1)": ["cylinder_tonnage_1", "cylinderTonnage1"],
  "Cylinder Wire Specification - Tonnage in Kgs (2)": ["cylinder_tonnage_2", "cylinderTonnage2"],
  "Doffer Wire Specification - Specs": ["doffer_specs", "dofferSpecs"],
  "Doffer Wire Specification - Tonnage in Kgs (1)": ["doffer_tonnage_1", "dofferTonnage1"],
  "Doffer Wire Specification - Tonnage in Kgs (2)": ["doffer_tonnage_2", "dofferTonnage2"],
  "Flat Wire Specification - Specs": ["flat_specs", "flatSpecs"],
  "Flat Wire Specification - Tonnage in Kgs (1)": ["flat_tonnage_1", "flatTonnage1"],
  "Flat Wire Specification - Tonnage in Kgs (2)": ["flat_tonnage_2", "flatTonnage2"],
  "Lickerin Wire Specification - Specs": ["lickerin_specs", "lickerinSpecs"],
  "Lickerin Wire Specification - Tonnage in Kgs (1)": ["lickerin_tonnage_1", "lickerinTonnage1"],
  "Lickerin Wire Specification - Tonnage in Kgs (2)": ["lickerin_tonnage_2", "lickerinTonnage2"],
  "Silver Hank": ["silver_hank", "silverHank"],
  "Delivery Mtr / Min": ["delivery_mtr_min", "deliveryMtrMin"],
  "Fibre Nep / Gms card mat": ["fibre_nep_gms_card_mat", "fibreNepGmsCardMat"],
  "Fibre Nep / Gms in Silver": ["fibre_nep_gms_silver", "fibreNepGmsSilver"],
  "Carding NRE%": ["carding_nre_percent", "cardingNrePercent"],
  "1mCV": ["cvm_1m", "im_cvm"],
  "3mCV": ["cvm_3m", "m3_cvm"],
  "CV in Metres": ["cvm"],
  "1m CV in Metres": ["cvm_1m"],
  "3m CV in Metres": ["cvm_3m"],
  "Feed in mm / Nep": ["feed_mm_per_nep"],
  "Comber NRE%": ["comber_nre_percent"],
  "50% span length in LAP": ["span_length_50_lap"],
  "50% span length in Sliver": ["span_length_50_sliver"],
  "Combing Efficiency": ["combining_efficiency_formula"],
  "Actual Specific Volume (Target)": ["actual_specific_volume_target"],
  "No. of Entries (N)": ["no_of_entries"],
  "B/R Line No": ["br_line_no"],
  "Machine Name": ["machine_name"],
  "Beater Type": ["beater_type"],
  "Beater Speed (RPM)": ["beater_speed_rpm"],
  "Weight (M)": ["weight"],
  "Volume 1": ["volume_1"],
  "Volume 2": ["volume_2"],
  "Average Volume (V)": ["average_volume"],
  "Apparent Specific Vol (A=V/M)": ["apparent_specific_volume"],
  "Actual Op. Value (AOV)": ["actual_op_value"],
  "Avg. Weight (M)": ["overall_avg_weight"],
  "Avg. Volume (V)": ["overall_avg_volume"],
  "Average of Apparent Specific Vol (A=V/M)": ["overall_avg_apparent_specific_volume"],
  "Average of Actual Op. Value (AOV)": ["overall_avg_actual_op_value"],
  "Openness %": ["apparent_specific_volume"],
  "Overall Openness Efficiency (%)": ["overall_avg_actual_op_value"],
  "Number of Readings (N)": ["num_readings"],
  "AVG (1Y)": ["avg_1yd"],
  "HANK (1Y)": ["hank_1yd"],
  "SD (1Y)": ["sd_1yd"],
  "CV% (1Y)": ["cv_1yd"],
  "AVG (1/2Y)": ["avg_half"],
  "HANK (1/2Y)": ["hank_half"],
  "SD (1/2Y)": ["sd_half"],
  "CV% (1/2Y)": ["cv_half"],
  "Process Type": ["sub_type"],
  "Stripper Waste": ["stripper_w"],
  "Auto Leveller": ["auto_level"],
  "Sliver Monitor": ["silver_worn"],
  "Mass Thick Place": ["main_tin"],
  "Scanning Roller Area": ["scanning"],
  "Department": ["department"],
  "Approval Status": ["approval_status"],
  "Operator": ["operator"],
  "Entry Date": ["entry_date"],
  "CDO No": ["cdo_no"],
  "CDG No Proposed": ["cdg_no_proposed"],
  "Mixing - Existing": ["mixing_existing"],
  "Mixing - Proposed": ["mixing_proposed"],
  "Blend % - Existing": ["blend_percent_existing"],
  "Blend % - Proposed": ["blend_percent_proposed"],
  "Delivery Hank - Existing": ["del_hank_existing"],
  "Delivery Hank - Proposed": ["del_hank_proposed"],
  "Feed Weight - Existing": ["feed_weight_existing"],
  "Feed Weight - Proposed": ["feed_weight_proposed"],
  "Lickerin Speed 1 - Existing": ["licker_in_speed_1_existing"],
  "Lickerin Speed 1 - Proposed": ["licker_in_speed_1_proposed"],
  "Lickerin Speed 2 - Existing": ["licker_in_speed_2_existing"],
  "Lickerin Speed 2 - Proposed": ["licker_in_speed_2_proposed"],
  "Cylinder Speed - Existing": ["cylinder_speed_existing"],
  "Cylinder Speed - Proposed": ["cylinder_speed_proposed"],
  "Flats Speed (MM/Min) - Existing": ["flats_speed_mm_min_existing"],
  "Flats Speed (MM/Min) - Proposed": ["flats_speed_mm_min_proposed"],
  "Feed Plate to Lickerin - Existing": ["feed_plate_to_licker_in_existing"],
  "Feed Plate to Lickerin - Proposed": ["feed_plate_to_licker_in_proposed"],
  "SFL - Existing": ["sfl_existing"],
  "SFL - Proposed": ["sfl_proposed"],
  "SFD - Existing": ["sfd_existing"],
  "SFD - Proposed": ["sfd_proposed"],
  "Cylinder to Flats - Existing": ["cylinder_to_flats_existing"],
  "Cylinder to Flats - Proposed": ["cylinder_to_flats_proposed"],
  "Cylinder to Doffer - Existing": ["cylinder_in_doffer_existing"],
  "Cylinder to Doffer - Proposed": ["cylinder_in_doffer_proposed"],
  "Web Speed Draft (MW-V4) - Existing": ["web_speed_draft_mw_v4_existing"],
  "Web Speed Draft (MW-V4) - Proposed": ["web_speed_draft_mw_v4_proposed"],
  "LC Wing Setting - Existing": ["lc_wing_setting_existing"],
  "LC Wing Setting - Proposed": ["lc_wing_setting_proposed"],
  "RR/RK Beater Speed - Existing": ["rr_rk_beater_speed_existing"],
  "RR/RK Beater Speed - Proposed": ["rr_rk_beater_speed_proposed"],
  "MC Production": ["mc_production", "mcProduction"],
  "Waste Type": ["waste_type", "wasteType"],
  "Waste Kgs Value": ["waste_kg", "wasteKg", "waste_kgs_value", "wasteKgsValue"],
  "Waste Kgs Percent": ["waste_percent", "wastePercent", "waste_kgs_percent", "wasteKgsPercent"],
  "Overall Waste": ["overall_percent", "overallPercent", "overall_waste", "overallWaste"],
  "Remarks": ["remarks"],
  "No. of Tufts": ["num_tufts", "numTufts"],
  "Tuft Variety": ["tuft_variety", "tuftVariety"],
  "Display Wt.": ["display_weight", "displayWeight"],
  "Actual Wt.": ["actual_weight", "actualWeight"],
  "Average Wt.": ["average_weight", "averageWeight"],
  "Diff (Actual Wt. - Display Wt.)": ["difference"],
  "Ratio (Average Wt. / Total) * 100": ["ratio_percent", "ratioPercent"],
  "Span Length (2.5%)": ["span_length", "spanLength"],
  "Invisible Loss %": ["invisible_loss_percentage", "invisible_loss_percent", "invisibleLossPercent"],
  "Trash Content %": ["trash_content_percentage", "trash_content_percent", "trashContentPercent"],
  "Yellow + B": ["yellow_b", "yellowB"],
  "TrCnt": ["trcnt", "tr_cnt", "trCnt"],
  "TrAr": ["trar", "tr_ar", "trAr"],
  "TrID": ["trid", "tr_id", "trID"],
  "Colour Grade": ["colour_grade", "color_grade", "colourGrade", "colorGrade"],
  "U%": ["u_percent", "uPercent"],
  "CV%": ["cv_percent", "cvPercent"],
  "Lot No.": ["lot_no", "lotNo"],
  "Invoice No": ["invoice_no", "invoiceNo"],
  "Length CV": ["length_cv", "lengthCV"],
  "Mean Denier": ["mean_denier", "meanDenier"],
  "CV per Denier": ["cv_per_denier", "cvPerDenier"],
  "CV per Tenacity": ["cv_per_tenacity", "cvPerTenacity"],
  "CV per Elongation": ["cv_per_elongation", "cvPerElongation"],
  "Crimp (ARC/CM)": ["crimp"],
  "Whiteness Index": ["whiteness_index", "whitenessIndex"],
  "Spin Finish": ["spin_finish", "spinFinish"],
  "UQL": ["uql"],
  "L5%": ["l5", "l5_percent", "l5Percent"],
  "SFC(N)": ["sfc_n", "sfcN"],
  "IFC %": ["ifc", "ifc_percent", "ifcPercent"],
  "Fibre Neps Gms": ["fibre_neps_gms", "fibreNepsGms"],
  "SFC(W)": ["sfc_w", "sfcW"],
  "Fineness": ["fineness"],
  "SCN/gm": ["scn_gms", "scnGms", "sc_nep_count_g", "scNepCountG"],
  "Crimp %": ["crimp_percent", "crimpPercent"],
  "Mc. Name": ["mc_name", "mcName"],
  "Blow Room": ["blow_room", "blowRoom"],
  "Breaker Drawing": ["breaker_drawing", "breakerDrawing"],
  "Finisher Drawing": ["finisher_drawing", "finisherDrawing"],
  "SCP NEP Count": ["scp_nep_count", "scpNepCount"],
  "L(W)": ["l_w_mm", "lWMm"],
  "L(W) CV": ["l_w_cv", "lWCv"],
  "SCF(W)<12.70mm": ["sfc_w_percent", "sfcWPercent"],
  "UQL(w)": ["uql_w_mm", "uqlWMm"],
  "L(n)": ["l_n_mm", "lNMm"],
  "L(n)CV": ["l_n_cv_percent", "lNCvPercent"],
  "SCF(n)<12.70mm": ["sfc_n_percent", "sfcNPercent"],
  "5%L(n)": ["five_pct_l_n_mm", "fivePctLNMm"],
  "Total Nep Count / g": ["total_nep_count_g", "totalNepCountG"],
  "Total Nep mean size": ["total_nep_mean_size_um", "totalNepMeanSizeUm"],
  "Fiber Nep Count": ["fiber_nep_count_g", "fiberNepCountG"],
  "Fiber Nep Mean Size": ["fiber_nep_mean_size_um", "fiberNepMeanSizeUm"],
  "SC Nep Count": ["sc_nep_count_g", "scNepCountG"],
  "SC Nep Mean Size": ["sc_nep_mean_size_um", "scNepMeanSizeUm"],
  "L(w)": ["l_w_mm", "lWMm"],
  "L(w)CV": ["l_w_cv", "lWCv"],
  "SCF(w)<12.70mm": ["sfc_w_percent", "sfcWPercent"],
  "Fitness Index": ["fitness_index", "fitnessIndex"],
  "Maturity Ratio Mat 1": ["maturity_ratio_mat1", "maturityRatioMat1"],
  "IFC%": ["ifc_percent", "ifcPercent"],
  "50%L(n)": ["fifty_pct_l_n_mm", "fiftyPctLNMm"],
  "Cut Length(n)": ["cut_length_n_mm", "cutLengthNMm"],
  "Fineness Den": ["fineness_den", "finenessDen"],
  "Fineness CV": ["fineness_cv_percent", "finenessCvPercent"],
  "Long Fiber >45.60mm": ["long_fiber_gt_46_80_percent", "longFiberGt4680Percent", "long_fiber_gt_45_60_percent", "longFiberGt4560Percent"],
  "Long Fiber Count >45.60mm": ["long_fiber_count_gt_46_80", "longFiberCountGt4680", "long_fiber_count_gt_45_60", "longFiberCountGt4560"],
  "Machine": ["machine_name", "machineName", "machine", "mc_name"],
  "Lap Weight (KGs)": ["lap_weight", "lapWeight"],
  "Lap Length (Mts)": ["lap_length", "lapLength"],
  "Grams / Meter": ["grams_per_meter", "gramsPerMeter"],
  "Average": ["average"],
  "Minimum": ["minimum"],
  "Maximum": ["maximum"],
  "Standard Deviation": ["std_deviation", "stdDeviation"],
  "Coefficient of Variation (CV%)": ["cv_percent", "cvPercent"],
};


const getCanonicalFieldKey = (field) => {
  const fieldKey = String(field?.key || field?.label || "").trim();
  const matchedAlias = Object.entries(REPORT_FIELD_ALIASES).find(([label, aliases]) =>
    [label, ...aliases].some((candidate) => normalizeLookup(candidate) === normalizeLookup(fieldKey))
  );
  return matchedAlias ? normalizeLookup(matchedAlias[0]) : normalizeLookup(fieldKey);
};

const uniqueReportFields = (fields) =>
  (Array.isArray(fields) ? fields : []).filter((field, index, list) => {
    const key = getCanonicalFieldKey(field);
    return key && index === list.findIndex((item) => getCanonicalFieldKey(item) === key);
  });

const findEntryIdLikeValue = (row) => {
  if (!row || typeof row !== "object") return null;
  const denylist = new Set(["id", "_id"]);
  const candidateKey = Object.keys(row).find((key) => {
    if (denylist.has(key)) return false;
    const normalized = normalizeLookup(key);
    return normalized.includes("entryid") || normalized.includes("entrycode") || normalized.includes("entryno");
  });
  if (!candidateKey) return null;
  const value = row[candidateKey];
  return value !== null && typeof value !== "undefined" && value !== "" ? value : null;
};

const BLEND_FIELD_PATTERN = /^blend-(\d+)$/i;

const getBlendFieldValue = (row, field) => {
  const match = BLEND_FIELD_PATTERN.exec(String(field?.label || field?.key || "").trim());
  if (!match) return undefined;
  const blendNo = Number(match[1]);
  const blends = Array.isArray(row?.blends) ? row.blends : [];
  const blend = blends.find((item) => Number(item?.blend_no) === blendNo);
  if (!blend) return null;
  return blend.percentage ?? null;
};

const SAMPLE_FIELD_PATTERN = /^sample\s*(\d+)$/i;

const getSampleFieldValue = (row, field) => {
  const match = SAMPLE_FIELD_PATTERN.exec(String(field?.label || field?.key || "").trim());
  if (!match) return undefined;
  const sampleNo = Number(match[1]);
  const sampleIndex = sampleNo - 1;

  const samplesRaw = row?.samples;
  const samples = Array.isArray(samplesRaw)
    ? samplesRaw
    : typeof samplesRaw === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(samplesRaw);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })()
      : null;
  if (samples) {
    const objectSample = samples.find(
      (item) => item && typeof item === "object" && Number(item.sample_no) === sampleNo
    );
    if (objectSample) {
      const objectValue = objectSample.value ?? objectSample.sample_value;
      if (objectValue !== null && typeof objectValue !== "undefined" && objectValue !== "") return objectValue;
    } else {
      const value = samples[sampleIndex];
      if (value !== null && typeof value !== "undefined" && value !== "") return value;
    }
  }

  const directKeys = [
    `sample_${sampleNo}`,
    `sample${sampleNo}`,
    `sampleNo${sampleNo}`,
    `Sample ${sampleNo}`,
  ];
  for (const key of directKeys) {
    if (row?.[key] !== null && typeof row?.[key] !== "undefined" && row?.[key] !== "") return row[key];
  }

  return null;
};

const WASTE_ROW_FIELD_KEYS = {
  "wastekgsvalue": "waste_kgs_value",
  "wastekgspercent": "waste_kgs_percent",
  "wastetype": "waste_type",
};

const getWasteRowFieldValue = (row, field) => {
  const canonical = normalizeLookup(field?.label || field?.key || "");
  const entryKey = WASTE_ROW_FIELD_KEYS[canonical];
  if (!entryKey) return undefined;

  if (row?.[entryKey] !== null && typeof row?.[entryKey] !== "undefined" && row?.[entryKey] !== "") {
    return row[entryKey];
  }

  const wasteRows = Array.isArray(row?.waste_rows) ? row.waste_rows : [];
  const firstRow = wasteRows.find(
    (item) => item && typeof item === "object" && item[entryKey] !== null && typeof item[entryKey] !== "undefined" && item[entryKey] !== ""
  );
  return firstRow ? firstRow[entryKey] : undefined;
};

const TYPE_ROW_FIELD_KEYS = {
  "cylinderspeed": "cylinder_speed",
  "lickerinspeed": "lickerin_speed",
  "flatspeed": "flat_speed",
  "dofferspeed": "doffer_speed",
  "deliveryspeed": "delivery_speed",
  "wingsetting": "wing_setting_1",
  "wingsettling1": "wing_setting_1",
  "wingsettling2": "wing_setting_2",
  "1stlickerinspeed": "lickerin_speed_1",
  "2ndlickerinspeed": "lickerin_speed_2",
  "3rdlickerinspeed": "lickerin_speed_3",
  "mcno": "mc_no",
  "mcproduction": "mc_production",
};

const getTypeRowFieldValue = (row, field) => {
  const canonical = normalizeLookup(field?.label || field?.key || "");
  const entryKey = TYPE_ROW_FIELD_KEYS[canonical];
  if (!entryKey) return undefined;

  if (row?.[entryKey] !== null && typeof row?.[entryKey] !== "undefined" && row?.[entryKey] !== "") {
    return row[entryKey];
  }

  const typeRows = Array.isArray(row?.type_rows) ? row.type_rows : [];
  const firstRow = typeRows.find(
    (item) => item && typeof item === "object" && item[entryKey] !== null && typeof item[entryKey] !== "undefined" && item[entryKey] !== ""
  );
  return firstRow ? firstRow[entryKey] : undefined;
};

const SYNC_ENTRY_FIELD_KEYS = {
  "runtime(seconds)": "value_a",
  "idletime(seconds)": "value_b",
  "subtotaltime": "value_c",
  "syncpercentage": "sync_percentage",
};

const getSyncEntryFieldValue = (row, field) => {
  const canonical = normalizeLookup(field?.label || field?.key || "");

  if (canonical === "numberofrowsn" || canonical === "numberofnepsentries") {
    if (row?.number_of_entries !== null && typeof row?.number_of_entries !== "undefined" && row?.number_of_entries !== "") {
      return row.number_of_entries;
    }
    const entries = Array.isArray(row?.entries) ? row.entries : null;
    return entries ? entries.length : undefined;
  }

  const entryKey = SYNC_ENTRY_FIELD_KEYS[canonical];
  if (!entryKey) return undefined;

  if (row?.[entryKey] !== null && typeof row?.[entryKey] !== "undefined" && row?.[entryKey] !== "") {
    return row[entryKey];
  }

  const entries = Array.isArray(row?.entries) ? row.entries : [];
  const firstEntry = entries.find(
    (entry) => entry && typeof entry === "object" && entry[entryKey] !== null && typeof entry[entryKey] !== "undefined" && entry[entryKey] !== ""
  );
  return firstEntry ? firstEntry[entryKey] : undefined;
};

const getReportFieldValue = (row, field) => {
  if (field?.key && /::\d+$/.test(field.key) && row?.[field.key] !== undefined) {
    return row[field.key];
  }

  const blendValue = getBlendFieldValue(row, field);
  if (typeof blendValue !== "undefined") return blendValue;

  const sampleValue = getSampleFieldValue(row, field);
  if (typeof sampleValue !== "undefined") return sampleValue;

  const syncValue = getSyncEntryFieldValue(row, field);
  if (typeof syncValue !== "undefined") return syncValue;

  const wasteRowValue = getWasteRowFieldValue(row, field);
  if (typeof wasteRowValue !== "undefined") return wasteRowValue;

  const typeRowValue = getTypeRowFieldValue(row, field);
  if (typeof typeRowValue !== "undefined") return typeRowValue;

  const keys = [
    field?.key,
    field?.label,
    ...(REPORT_FIELD_ALIASES[field?.label] || []),
    ...(REPORT_FIELD_ALIASES[field?.key] || []),
  ].filter(Boolean);

  for (const key of keys) {
    const value = getDashboardFieldValue(row, key);
    if (value !== null && typeof value !== "undefined" && value !== "") return value;
  }

  return null;
};

const CREATED_AT_FIELD = { key: "created_at", label: "Created At" };
const ENTRY_ID_FIELD = { key: "entry_id", label: "Entry ID" };
const INVOICE_DATE_FIELD_KEYS = new Set(["invoicedate"]);

const formatIstDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
};

const formatIstDateOnly = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
};

const getCellValue = (row, field) => {
  const isCreatedAtField = getCanonicalFieldKey(field) === getCanonicalFieldKey(CREATED_AT_FIELD);
  const isEntryIdField = getCanonicalFieldKey(field) === getCanonicalFieldKey(ENTRY_ID_FIELD);
  const isInvoiceDateField = INVOICE_DATE_FIELD_KEYS.has(getCanonicalFieldKey(field));
  const value = isCreatedAtField
    ? getReportFieldValue(row, field) || getDashboardRowDate(row)
    : isEntryIdField
      ? getReportFieldValue(row, field) || findEntryIdLikeValue(row)
      : getReportFieldValue(row, field);
  if (value === null || typeof value === "undefined" || value === "") return "-";
  if (isCreatedAtField) return formatIstDateTime(value);
  if (isInvoiceDateField) return formatIstDateOnly(value);
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const getFieldsForType = (typeName, typeRows, context, pivotedFields) => {
  if (typeName === THICK_PLACE_CV_SCREEN_NAME) {
    return uniqueReportFields([ENTRY_ID_FIELD, ...(pivotedFields || []), CREATED_AT_FIELD]);
  }
  if (typeName === NATI_DATA_ENTRY_SCREEN_NAME) {
    const numberOfEntriesField = toField("Number of Neps Entries");
    return uniqueReportFields([ENTRY_ID_FIELD, numberOfEntriesField, ...(pivotedFields || []), CREATED_AT_FIELD]);
  }
  if (typeName === BETWEEN_WITHIN_CARD_SCREEN_NAME) {
    return uniqueReportFields([ENTRY_ID_FIELD, ...getFieldsForBetweenWithinCard(), CREATED_AT_FIELD]);
  }
  const catalogFields = getThresholdFieldsForScreen(typeName, context).map(toField).filter(Boolean);
  if (typeName === COMBER_NOLIS_SCREEN_NAME) {
    const droppedLabels = new Set(["Noils %", "Sample No", "Sliver Wt", "Noils Wt"]);
    const nonSampleFields = catalogFields.filter((field) => !droppedLabels.has(field.label));
    const firstSampleIndex = catalogFields.findIndex((field) => droppedLabels.has(field.label));
    const insertAt = firstSampleIndex === -1
      ? nonSampleFields.length
      : catalogFields.slice(0, firstSampleIndex).filter((field) => !droppedLabels.has(field.label)).length;
    const merged = [
      ...nonSampleFields.slice(0, insertAt),
      ...(pivotedFields || []),
      ...nonSampleFields.slice(insertAt),
    ];
    return uniqueReportFields([ENTRY_ID_FIELD, ...merged, CREATED_AT_FIELD]);
  }
  if (SAMPLE_PIVOT_SCREEN_NAMES.has(typeName)) {
    const nonSampleFields = catalogFields.filter((field) => !/^Sample \d+$/.test(field.label));
    const firstSampleIndex = catalogFields.findIndex((field) => /^Sample \d+$/.test(field.label));
    const insertAt = firstSampleIndex === -1 ? nonSampleFields.length : firstSampleIndex;
    const merged = [
      ...nonSampleFields.slice(0, insertAt),
      ...(pivotedFields || []),
      ...nonSampleFields.slice(insertAt),
    ];
    return uniqueReportFields([ENTRY_ID_FIELD, ...merged, CREATED_AT_FIELD]);
  }
  const fields = uniqueReportFields(catalogFields.length ? catalogFields : inferFields(typeRows));
  return uniqueReportFields([ENTRY_ID_FIELD, ...fields, CREATED_AT_FIELD]);
};

const sanitizeFilenamePart = (value) =>
  String(value || "report")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "report";

const escapeCsvValue = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const downloadFile = (filename, content, type) => {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const loadExcelJS = async () => {
  const excelJSImport = await import("exceljs");
  return excelJSImport?.default || excelJSImport;
};

const getWorksheetName = (name, index, usedNames) => {
  const fallbackName = `Report ${index + 1}`;
  const baseName =
    String(name || fallbackName)
      .replace(/[:\\/?*[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || fallbackName;
  let sheetName = baseName;
  let suffix = 2;

  while (usedNames.has(sheetName)) {
    const suffixText = ` ${suffix}`;
    sheetName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  usedNames.add(sheetName);
  return sheetName;
};

export default function GeneralReport() {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(toInputDate(today));
  const [toDate, setToDate] = useState(toInputDate(today));
  const fromDateInputRef = useRef(null);
  const toDateInputRef = useRef(null);

  const [selectedDept, setSelectedDept] = useState("");
  const [selectedSubDept, setSelectedSubDept] = useState("");
  const [selectedNotebook, setSelectedNotebook] = useState("");
  const [isReportGenerated, setIsReportGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [rows, setRows] = useState([]);
  const [rowsByType, setRowsByType] = useState({});
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState("");
  const departments = useMemo(() => departmentDirectory, []);
  const selectedDepartment = useMemo(
    () => departments.find((department) => department.name === selectedDept),
    [departments, selectedDept]
  );
  const subDepartments = selectedDepartment?.subDepartments || [];
  const selectedSubDepartment = useMemo(
    () => subDepartments.find((subDepartment) => subDepartment.name === selectedSubDept),
    [subDepartments, selectedSubDept]
  );
  const notebooks = useMemo(
    () => getThresholdScreensForSubDepartment(selectedDepartment?.slug, selectedSubDepartment?.slug),
    [selectedDepartment?.slug, selectedSubDepartment?.slug]
  );
  const typeOptions = useMemo(
    () => (notebooks.length ? [{ value: ALL_TYPES_VALUE, label: "All Type" }, ...notebooks.map((type) => ({ value: type, label: type }))] : []),
    [notebooks]
  );
  const isAllTypeSelected = selectedNotebook === ALL_TYPES_VALUE;
  const isInvoiceDataType = String(selectedNotebook || "").trim().toLowerCase().includes("invoice");
  const applyScreenTransform = (typeName, typeRows) => {
    if (typeName === THICK_PLACE_CV_SCREEN_NAME) return pivotThickPlaceCvRows(typeRows);
    if (typeName === NATI_DATA_ENTRY_SCREEN_NAME) return pivotNatiDataEntryRows(typeRows);
    if (typeName === COMBER_NOLIS_SCREEN_NAME) return pivotComberNolisRows(typeRows);
    if (SAMPLE_PIVOT_SCREEN_NAMES.has(typeName)) return pivotSampleRows(typeRows);
    return { pivotedRows: typeRows, pivotedFields: null };
  };

  const filteredRows = useMemo(() => {
    const baseRows = withDropTestTuftCounts(isInvoiceDataType ? rows : filterRowsByDateRange(rows, fromDate, toDate));
    return applyScreenTransform(selectedNotebook, baseRows).pivotedRows;
  }, [fromDate, isInvoiceDataType, rows, selectedNotebook, toDate]);
  const thickPlaceCvFields = useMemo(() => {
    if (selectedNotebook !== THICK_PLACE_CV_SCREEN_NAME) return null;
    const baseRows = withDropTestTuftCounts(isInvoiceDataType ? rows : filterRowsByDateRange(rows, fromDate, toDate));
    return pivotThickPlaceCvRows(baseRows).pivotedFields;
  }, [fromDate, isInvoiceDataType, rows, selectedNotebook, toDate]);
  const natiDataEntryFields = useMemo(() => {
    if (selectedNotebook !== NATI_DATA_ENTRY_SCREEN_NAME) return null;
    const baseRows = withDropTestTuftCounts(isInvoiceDataType ? rows : filterRowsByDateRange(rows, fromDate, toDate));
    return pivotNatiDataEntryRows(baseRows).pivotedFields;
  }, [fromDate, isInvoiceDataType, rows, selectedNotebook, toDate]);
  const sampleFields = useMemo(() => {
    if (!SAMPLE_PIVOT_SCREEN_NAMES.has(selectedNotebook)) return null;
    const baseRows = withDropTestTuftCounts(isInvoiceDataType ? rows : filterRowsByDateRange(rows, fromDate, toDate));
    return pivotSampleRows(baseRows).pivotedFields;
  }, [fromDate, isInvoiceDataType, rows, selectedNotebook, toDate]);
  const comberNolisFields = useMemo(() => {
    if (selectedNotebook !== COMBER_NOLIS_SCREEN_NAME) return null;
    const baseRows = withDropTestTuftCounts(isInvoiceDataType ? rows : filterRowsByDateRange(rows, fromDate, toDate));
    return pivotComberNolisRows(baseRows).pivotedFields;
  }, [fromDate, isInvoiceDataType, rows, selectedNotebook, toDate]);
  const filteredRowsByType = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(rowsByType).map(([typeName, typeRows]) => {
          const baseRows = withDropTestTuftCounts(isInvoiceDataType ? typeRows : filterRowsByDateRange(typeRows, fromDate, toDate));
          return [typeName, applyScreenTransform(typeName, baseRows).pivotedRows];
        })
      ),
    [fromDate, isInvoiceDataType, rowsByType, toDate]
  );
  const reportFields = useMemo(() => {
    if (isAllTypeSelected) return [];
    const pivotedFields = selectedNotebook === NATI_DATA_ENTRY_SCREEN_NAME
      ? natiDataEntryFields
      : selectedNotebook === COMBER_NOLIS_SCREEN_NAME
        ? comberNolisFields
        : SAMPLE_PIVOT_SCREEN_NAMES.has(selectedNotebook)
          ? sampleFields
          : thickPlaceCvFields;
    return getFieldsForType(selectedNotebook, filteredRows, selectedSubDept, pivotedFields);
  }, [comberNolisFields, filteredRows, isAllTypeSelected, natiDataEntryFields, sampleFields, selectedNotebook, selectedSubDept, thickPlaceCvFields]);
  const reportSections = useMemo(() => {
    if (!isAllTypeSelected) {
      return [{ typeName: selectedNotebook, rows: filteredRows, fields: reportFields }];
    }

    return notebooks.map((typeName) => {
      const typeRows = filteredRowsByType[typeName] || [];
      const pivotedFields =
        typeName === THICK_PLACE_CV_SCREEN_NAME
          ? fieldsFromPivotedRows(typeRows)
          : typeName === NATI_DATA_ENTRY_SCREEN_NAME
            ? fieldsFromNatiPivotedRows(typeRows)
            : typeName === COMBER_NOLIS_SCREEN_NAME
              ? fieldsFromComberNolisPivotedRows(typeRows)
              : SAMPLE_PIVOT_SCREEN_NAMES.has(typeName)
                ? fieldsFromSamplePivotedRows(typeRows)
                : null;
      return {
        typeName,
        rows: typeRows,
        fields: getFieldsForType(typeName, typeRows, selectedSubDept, pivotedFields),
      };
    });
  }, [filteredRows, filteredRowsByType, isAllTypeSelected, notebooks, reportFields, selectedNotebook, selectedSubDept]);
  const totalColumns = useMemo(
    () => reportSections.reduce((total, section) => total + section.fields.length, 0),
    [reportSections]
  );
  const totalRows = useMemo(
    () => reportSections.reduce((total, section) => total + section.rows.length, 0),
    [reportSections]
  );
  const reportDateLabel = `${toDisplayDate(fromDate)}${toDate && toDate !== fromDate ? ` - ${toDisplayDate(toDate)}` : ""}`;
  const reportTimeLabel = generatedAt
    ? new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(generatedAt))
    : "-";
  const currentDateLabel = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currentTimeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date());

  useEffect(() => {
    if (!selectedDept && departments.length) {
      setSelectedDept(departments[0].name);
    }
  }, [departments, selectedDept]);

  useEffect(() => {
    const nextSubDepartment = subDepartments[0]?.name || "";
    if (!selectedSubDept || !subDepartments.some((subDepartment) => subDepartment.name === selectedSubDept)) {
      setSelectedSubDept(nextSubDepartment);
    }
  }, [selectedSubDept, subDepartments]);

  useEffect(() => {
    const validTypes = [ALL_TYPES_VALUE, ...notebooks];
    const nextNotebook = notebooks.length ? ALL_TYPES_VALUE : "";
    if (!selectedNotebook || !validTypes.includes(selectedNotebook)) {
      setSelectedNotebook(nextNotebook);
      setIsReportGenerated(false);
    }
  }, [notebooks, selectedNotebook]);

  useEffect(() => {
    let isActive = true;

    const loadRows = async () => {
      if (!isReportGenerated || !selectedDept || !selectedSubDept || !selectedNotebook) {
        setRows([]);
        setRowsByType({});
        return;
      }

      try {
        setLoadingRows(true);
        setRowsError("");
        if (selectedNotebook === ALL_TYPES_VALUE) {
          const results = await Promise.all(
            notebooks.map(async (typeName) => {
              const typeRows = await fetchRowsForDashboardWidget({
                department: selectedDept,
                sub_department: selectedSubDept,
                input_screen: typeName,
              });
              return [typeName, typeRows];
            })
          );
          if (isActive) {
            const nextRowsByType = Object.fromEntries(results);
            setRowsByType(nextRowsByType);
            setRows(results.flatMap(([, typeRows]) => typeRows));
          }
          return;
        }

        const nextRows = await fetchRowsForDashboardWidget({
          department: selectedDept,
          sub_department: selectedSubDept,
          input_screen: selectedNotebook,
        });
        if (isActive) {
          setRows(nextRows);
          setRowsByType({ [selectedNotebook]: nextRows });
        }
      } catch (error) {
        if (!isActive) return;
        setRows([]);
        setRowsByType({});
        setRowsError(error?.message || "Unable to load report data.");
      } finally {
        if (isActive) setLoadingRows(false);
      }
    };

    loadRows();

    return () => {
      isActive = false;
    };
  }, [isReportGenerated, notebooks, selectedDept, selectedNotebook, selectedSubDept]);

  useEffect(() => {
    setIsReportGenerated(false);
  }, [fromDate, toDate, selectedDept, selectedSubDept, selectedNotebook]);

  const openCalendarPicker = (inputRef) => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  const handleGenerateReport = () => {
    if (!selectedDept || !selectedSubDept || !selectedNotebook) return;
    setIsReportGenerated(true);
    setGeneratedAt(new Date().toISOString());
  };

  const getReportFilename = (extension) =>
    [
      "general-report",
      sanitizeFilenamePart(selectedSubDept),
      sanitizeFilenamePart(isAllTypeSelected ? "all-type" : selectedNotebook),
      fromDate,
      toDate,
    ]
      .filter(Boolean)
      .join("-") + `.${extension}`;

  const handleExportCsv = () => {
    const lines = reportSections.flatMap((section) => {
      const header = section.fields.map((field) => escapeCsvValue(field.label)).join(",");
      const body = section.rows.map((row) =>
        section.fields.map((field) => escapeCsvValue(getCellValue(row, field))).join(",")
      );
      return [
        escapeCsvValue(section.typeName),
        header,
        ...(body.length ? body : [`${escapeCsvValue("No data stored for the selected date.")}`]),
        "",
      ];
    });
    downloadFile(getReportFilename("csv"), lines.join("\r\n"), "text/csv;charset=utf-8");
  };

  const handleExportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Spintelligence";
      const usedSheetNames = new Set();
      const reportDateLabel = `${toDisplayDate(fromDate)}${toDate && toDate !== fromDate ? ` - ${toDisplayDate(toDate)}` : ""}`;

      reportSections.forEach((section, index) => {
        const fields = section.fields.length ? section.fields : [{ key: "__report_data", label: "Report Data" }];
        const sheet = workbook.addWorksheet(getWorksheetName(section.typeName, index, usedSheetNames));
        sheet.addRow([
          "Department :",
          selectedDept || "-",
          "",
          "Selected Date :",
          reportDateLabel || "-",
        ]);
        sheet.addRow([
          "Sub-department :",
          selectedSubDept || "-",
          "",
          "Current Date :",
          currentDateLabel || "-",
        ]);
        sheet.addRow([
          "Notebook Type :",
          isAllTypeSelected ? "All Type" : selectedNotebook || "-",
          "",
          "Current Time :",
          currentTimeLabel || "-",
        ]);
        sheet.addRow([]);
        sheet.addRow(fields.map((field) => field.label));

        if (section.rows.length && section.fields.length) {
          section.rows.forEach((row) => {
            sheet.addRow(fields.map((field) => getCellValue(row, field)));
          });
        } else {
          sheet.addRow(["No data stored for the selected date."]);
        }

        [1, 2, 3, 5].forEach((rowNumber) => {
          sheet.getRow(rowNumber).font = { bold: true };
        });
        sheet.getRow(4).height = 4;
        sheet.columns = [
          { width: 18 },
          { width: 28 },
          { width: 6 },
          { width: 18 },
          { width: 28 },
          ...fields.map((field) => ({
            width: Math.min(Math.max(String(field.label).length + 4, 16), 36),
          })),
        ];
      });

      const buffer = await workbook.xlsx.writeBuffer();
      downloadFile(getReportFilename("xlsx"), buffer, XLSX_MIME);
    } catch (error) {
      console.error(error);
    }
  };

  const handleExportPdf = () => {
    if (typeof window === "undefined") return;

    const sectionsHtml = reportSections
      .map((section) => {
        const headerCells = section.fields.map((field) => `<th>${escapeHtml(field.label)}</th>`).join("");
        const bodyRows = section.rows.length
          ? section.rows
              .map((row) => `<tr>${section.fields.map((field) => `<td>${escapeHtml(getCellValue(row, field))}</td>`).join("")}</tr>`)
              .join("")
          : `<tr><td colspan="${Math.max(section.fields.length, 1)}">No data stored for the selected date.</td></tr>`;
        return `<h2>${escapeHtml(section.typeName)}</h2><table><thead><tr>${headerCells || "<th>Report Data</th>"}</tr></thead><tbody>${bodyRows}</tbody></table>`;
      })
      .join("");
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>General Report</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #101828; font-family: Arial, sans-serif; font-size: 10px; }
            h1 { margin: 0 0 8px; font-size: 18px; }
            h2 { margin: 16px 0 8px; font-size: 13px; break-after: avoid; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-bottom: 14px; color: #344054; font-size: 11px; }
            .meta-col { display: grid; gap: 4px; align-content: start; }
            .meta strong { color: #101828; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 10px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #d0d5dd; padding: 5px; text-align: left; vertical-align: top; word-break: break-word; }
            th { background: #f2f4f7; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>General Report</h1>
          <section class="meta">
            <div class="meta-col">
              <div><strong>Dept:</strong> ${escapeHtml(selectedDept || "-")}</div>
              <div><strong>Sub-Dept:</strong> ${escapeHtml(selectedSubDept || "-")}</div>
              <div><strong>Type:</strong> ${escapeHtml(isAllTypeSelected ? "All Type" : selectedNotebook || "-")}</div>
            </div>
            <div class="meta-col">
              <div><strong>Selected Date:</strong> ${escapeHtml(toDisplayDate(fromDate))} - ${escapeHtml(toDisplayDate(toDate))}</div>
              <div><strong>Current Date:</strong> ${escapeHtml(currentDateLabel)}</div>
              <div><strong>Current Time:</strong> ${escapeHtml(currentTimeLabel)}</div>
            </div>
          </section>
          ${sectionsHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <main className={styles.page}>
      <section className={`${styles.filterCard} ${styles.generalReportCard}`}>
        <div className={styles.generalReportHeader}>
          <span className={styles.headingIcon}>
            <FiFileText />
          </span>
          <div>
            <h1>General Report</h1>
            <p>Generate and schedule input task reports</p>
          </div>
        </div>

        <div className={styles.filterTitle} style={{ marginTop: 18 }}>
          Filter
        </div>

        <div className={styles.filterGrid}>
          <div className={styles.fieldGroup}>
            <label>Department</label>
            <select value={selectedDept} onChange={(e) => { setSelectedDept(e.target.value); setSelectedSubDept(""); setSelectedNotebook(""); }}>
              <option value="">Select Department</option>
              {departments.map((d) => (
                <option key={d.slug} value={d.name}>{d.name}</option>
              ))}
            </select>
            <FiChevronDown />
          </div>

          <div className={styles.fieldGroup}>
            <label>Sub Departments</label>
            <select value={selectedSubDept} onChange={(e) => { setSelectedSubDept(e.target.value); setSelectedNotebook(""); }}>
              <option value="">Select Sub Department</option>
              {subDepartments.map((s) => (
                <option key={s.slug} value={s.name}>{s.name}</option>
              ))}
            </select>
            <FiChevronDown />
          </div>

          <div className={styles.fieldGroup}>
            <label>Type</label>
            <select value={selectedNotebook} onChange={(e) => { setSelectedNotebook(e.target.value); }}>
              <option value="">Select Type</option>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <FiChevronDown />
          </div>

          <>
            <div className={`${styles.fieldGroup} ${styles.dateGroup}`}>
              <label>Date - From</label>
              <button type="button" className={styles.dateInputs} onClick={() => openCalendarPicker(fromDateInputRef)}>
                <span className={styles.dateDisplay}>{toDisplayDate(fromDate)}</span>
                <input
                  ref={fromDateInputRef}
                  className={styles.hiddenDateInput}
                  type="date"
                  value={fromDate}
                  tabIndex={-1}
                  onChange={(event) => setFromDate(event.target.value)}
                />
                <FiCalendar />
              </button>
            </div>

            <div className={`${styles.fieldGroup} ${styles.dateGroup}`}>
              <label>Date - To</label>
              <button type="button" className={styles.dateInputs} onClick={() => openCalendarPicker(toDateInputRef)}>
                <span className={styles.dateDisplay}>{toDisplayDate(toDate)}</span>
                <input
                  ref={toDateInputRef}
                  className={styles.hiddenDateInput}
                  type="date"
                  value={toDate}
                  tabIndex={-1}
                  onChange={(event) => setToDate(event.target.value)}
                />
                <FiCalendar />
              </button>
            </div>
          </>

          <div className={styles.generateActionGroup}>
            <button type="button" className={styles.generateReportButton} onClick={handleGenerateReport}>
              Generate Report
            </button>
          </div>
        </div>

        {isReportGenerated ? (
          <>
            <div className={styles.reportMetaBar}>
              <div className={styles.reportMetaItem}>
                <span className={styles.reportMetaLabel}>Current Time</span>
                <strong>{reportTimeLabel}</strong>
              </div>
              <div className={styles.reportMetaItem}>
                <span className={styles.reportMetaLabel}>Date</span>
                <strong>{reportDateLabel || "-"}</strong>
              </div>
            </div>

            {reportSections.map((section) => (
              <section key={section.typeName} style={{ marginTop: 18 }}>
                <h2 className={styles.reportSectionTitle}>{section.typeName}</h2>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        {section.fields.length ? (
                          section.fields.map((field) => <th key={field.key}>{field.label}</th>)
                        ) : (
                          <th>Report Data</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingRows ? (
                        <tr>
                          <td colSpan={section.fields.length || 1}>Loading report details...</td>
                        </tr>
                      ) : null}
                      {!loadingRows && rowsError ? (
                        <tr>
                          <td colSpan={section.fields.length || 1}>{rowsError}</td>
                        </tr>
                      ) : null}
                      {!loadingRows && !rowsError && section.rows.length ? (() => {
                        const rowGroups = buildRowGroups(section.rows);
                        let rowIndex = 0;
                        return rowGroups.flatMap((group) =>
                          group.map((row, indexInGroup) => {
                            const tr = (
                              <tr key={row?.id || row?.entry_id || `${section.typeName}-${rowIndex}`}>
                                {section.fields.map((field) => {
                                  if (isMergedReportField(section.typeName, field)) {
                                    if (indexInGroup > 0) return null;
                                    return (
                                      <td key={field.key} rowSpan={group.length}>
                                        {getCellValue(row, field)}
                                      </td>
                                    );
                                  }
                                  return <td key={field.key}>{getCellValue(row, field)}</td>;
                                })}
                              </tr>
                            );
                            rowIndex += 1;
                            return tr;
                          })
                        );
                      })() : null}
                      {!loadingRows && !rowsError && !section.rows.length ? (
                        <tr>
                          <td colSpan={section.fields.length || 1}>No data stored for the selected date.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        ) : null}

        <div className={styles.exportBar} style={{ marginTop: 18 }}>
          <p>Select filters and generate the report to view tables.</p>

          <div className={styles.exportActions}>
            <button type="button" onClick={() => router.push("/reports")}>Schedule Report</button>
            <button type="button" onClick={handleExportCsv} disabled={!isReportGenerated}>Export CSV</button>
            <button type="button" onClick={handleExportExcel} disabled={!isReportGenerated}>Export Excel</button>
            <button type="button" className={styles.primaryExport} onClick={handleExportPdf} disabled={!isReportGenerated}>Export PDF</button>
          </div>
        </div>
      </section>
    </main>
  );
}
