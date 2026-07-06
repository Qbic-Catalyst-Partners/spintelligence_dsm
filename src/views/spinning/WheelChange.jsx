import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import { fetchSpinningMachineNumberOptions, fetchSpinningWheelChangeDropdown, fetchSpinningWheelChangeLatestRecord } from "@/apis/spinning";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "@/styles/spinningWheelChange.module.css";

const WHEEL_CHANGE_TYPES = ["Type 1", "Type 2", "Type 3", "Type 4"];
const WHEEL_CHANGE_API_TYPES = {
  "Type 1": "type1",
  "Type 2": "type2",
  "Type 3": "type3",
  "Type 4": "type1",
};
const WHEEL_CHANGE_DRAFT_STORAGE_KEY = "spinning_wheel_change_last_values";
const STATIC_RF_NO_OPTIONS = ["1", "2", "3", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "20", "24"];
const STATIC_TYPE_1_DROPDOWN_OPTIONS = {
  rh: ["40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68"],
  bd: ["1.92", "1.87", "1.83", "1.79", "1.75", "1.71", "1.67", "1.63", "1.60", "1.57", "1.54", "1.51", "1.48", "1.45", "1.42", "1.40", "1.37", "1.35", "1.32", "1.30", "1.28", "1.26", "1.24", "1.22", "1.20", "1.18", "1.16", "1.15", "1.13"],
  dca: ["43"],
  dcb: ["127"],
  dpc: ["132", "133", "134", "135"],
  dc: [
    "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "70",
  ],
  totalDraft: [
    "26.11", "26.3", "26.49", "26.5", "26.69", "26.7", "26.89", "27.08", "27.09", "27.28", "27.48", "27.49", "27.69", "27.9", "28.11", "28.32", "28.33", "28.54", "28.75", "28.77", "28.99", "29.2", "29.23", "29.45", "29.67", "29.7", "29.92", "30.15", "30.19", "30.41", "30.64", "30.69", "30.92", "31.15", "31.21", "31.44", "31.68", "31.75", "31.99", "32.22", "32.3", "32.55", "32.79", "32.88", "33.13", "33.38", "33.48", "33.73", "33.98", "34.1", "34.35", "34.61", "34.74", "35", "35.26", "35.41", "35.68", "35.94", "36.1", "36.38", "36.65", "36.83", "37.1", "37.38", "37.58", "37.86", "38.14", "38.36", "38.65", "38.94", "39.18", "39.47", "39.77", "40.03", "40.92", "41.23", "41.53", "41.85", "42.16", "42.48", "42.82", "43.14", "43.47", "43.84", "44.17", "44.5", "44.91", "45.25", "45.59", "46.03", "46.38", "46.73", "47.21", "47.57", "47.92", "48.46", "48.82", "49.18", "49.77", "50.14", "50.51", "51.15", "51.53", "51.92", "52.61", "53", "53.4", "54.16", "54.56", "54.97", "55.8", "56.22", "56.64", "57.54", "57.97", "58.41", "59.4", "59.84", "60.29", "61.38", "61.84", "62.3",
  ],
};
const TYPE_2_BDW_TO_BD = {
  "40": "1.92",
  "41": "1.87",
  "42": "1.83",
  "43": "1.79",
  "44": "1.75",
  "45": "1.71",
  "46": "1.67",
  "47": "1.63",
  "48": "1.6",
  "49": "1.57",
  "50": "1.54",
  "51": "1.51",
  "52": "1.48",
  "53": "1.45",
  "54": "1.42",
  "55": "1.4",
  "56": "1.37",
  "57": "1.35",
  "58": "1.32",
  "59": "1.3",
  "60": "1.28",
  "61": "1.26",
  "62": "1.24",
  "63": "1.22",
  "64": "1.2",
  "65": "1.18",
  "66": "1.16",
  "67": "1.15",
  "68": "1.13",
};
const TYPE_2_B_TO_A = {
  "76": "89",
  "77": "88",
  "78": "87",
  "79": "86",
  "80": "85",
  "81": "84",
  "82": "83",
  "83": "82",
  "84": "81",
  "85": "80",
  "86": "79",
  "87": "78",
  "88": "77",
  "89": "76",
};
const TYPE_2_D_TO_C = {
  "102": "35",
  "98": "39",
  "91": "46",
  "82": "55",
  "72": "65",
  "65": "72",
  "55": "82",
  "46": "91",
  "39": "98",
  "35": "102",
};
const STATIC_TYPE_2_DROPDOWN_OPTIONS = {
  bdv: Object.keys(TYPE_2_BDW_TO_BD),
  bd: Object.values(TYPE_2_BDW_TO_BD),
  t: Object.keys(TYPE_2_B_TO_A),
  b: Object.values(TYPE_2_B_TO_A),
  f: Object.keys(TYPE_2_D_TO_C),
  c: Object.values(TYPE_2_D_TO_C),
};
const TYPE_1_TW_OPTIONS = Array.from({ length: 41 }, (_, index) => String(index + 30));
const TYPE_1_TPI_OPTIONS = {
  default: [
    "55.49","53.7","52.02","50.44","48.96","47.56","46.24","44.99","43.81","42.68","41.62","40.6","39.63","38.71","37.83","36.99","36.19","35.42","34.68","33.97","33.29","32.64","32.01","31.41","30.81","30.27","29.73","29.2","28.7","28.21","27.74","27.29","26.85","26.42","26.01","25.61","25.22","24.85","24.48","24.13","23.78",
    "37.19","35.99","34.87","33.81","32.81","31.88","30.99","30.15","29.36","28.61","27.89","27.21","26.56","25.95","25.36","24.79","24.25","23.74","23.24","22.79","22.31","21.88","21.46","21.05","20.66","20.29","19.92","19.57","19.24","18.91","18.59","18.29","17.99","17.71","17.43","17.16","16.9","16.65","16.41","16.17","15.94",
    "30.41","29.43","28.51","27.64","26.83","26.07","25.34","24.66","24","23.39","22.81","22.25","21.72","21.22","20.73","20.27","19.83","19.41","19.01","18.62","18.25","17.89","17.54","17.21","16.89","16.59","16.29","16","15.73","15.46","15.2","14.96","14.71","14.48","14.25","14.04","13.82","13.62","13.42","13.22","13.03",
    "20.6","19.94","19.32","18.73","18.18","17.66","17.17","16.71","16.27","15.85","15.45","15.08","14.72","14.37","14.05","13.74","13.44","13.15","12.88","12.62","12.36","12.12","11.89","11.66","11.45","11.24","11.04","10.84","10.66","10.48","10.3","10.13","9.97","9.81","9.66","9.51","9.37","9.23","9.09","8.96","8.83",
  ],
  "3": [
    "50.93","49.28","47.74","46.3","44.93","43.65","42.44","41.29","40.2","39.17","38.19","37.26","36.38","35.53","34.72","33.95","33.21","32.51","31.83","31.18","30.56","29.96","29.38","28.83","28.29","27.78","27.28","26.8","26.34","25.89","25.46","25.05","24.64","24.25","23.87","23.5","23.15","22.8","22.47","22.14","21.83",
    "34.13","33.03","32","31.03","30.12","29.26","28.44","27.67","26.95","26.25","25.6","24.97","24.38","23.81","23.27","22.75","22.26","21.79","21.33","20.9","20.48","20.08","19.69","19.32","18.96","18.62","18.28","17.96","17.65","17.35","17.07","16.79","16.52","16.25","16","15.75","15.51","15.28","15.06","14.84","14.63",
    "27.91","27.01","26.16","25.37","24.63","23.92","23.26","22.63","22.03","21.47","20.93","20.42","19.93","19.47","19.03","18.61","18.2","17.81","17.44","17.09","16.75","16.42","16.1","15.8","15.5","15.22","14.95","14.69","14.44","14.19","13.95","13.73","13.5","13.29","13.08","12.88","12.69","12.5","12.31","12.13","11.96",
    "18.91","18.3","17.73","17.19","16.69","16.21","15.76","15.33","14.93","14.55","14.18","13.84","13.51","13.19","12.89","12.61","12.33","12.07","11.82","11.58","11.35","11.13","10.91","10.7","10.51","10.31","10.13","9.95","9.78","9.62","9.46","9.3","9.15","9","8.86","8.73","8.6","8.47","8.34","8.22","8.1",
  ],
};
const TYPE_1_TCW_OPTIONS = ["36/88", "47/77", "53/71", "65/59"];
const getType1MachineSpecificOptions = (rowKey, machineNumber = "") => {
  if (rowKey === "tdv") return TYPE_1_TCW_OPTIONS;
  if (rowKey === "tm") return TYPE_1_TW_OPTIONS;
  if (rowKey === "tciTm") return TYPE_1_TPI_OPTIONS[String(machineNumber).trim() === "3" ? "3" : "default"] || TYPE_1_TPI_OPTIONS.default;
  return [];
};

const TYPE_1_PARAMETER_ROWS = [
  { key: "countForm", label: "Count From", inputType: "select" },
  { key: "lycraType", label: "Lycra Type" },
  { key: "lycraDraft", label: "Lycra Draft" },
  { key: "tmDisc", label: "Slub Code" },
  { key: "range", label: "Ramp" },
  { key: "offsetDia", label: "Offset On/Off" },
  { key: "gapsCourseCondition", label: "Cop or Cone Condition" },
  { key: "diameterDoffSpeed", label: "Product Qty (Kgs)" },
  { key: "rovingHank", label: "Raving Hank" },
  { key: "rh", label: "BDW", inputType: "select" },
  { key: "bd", label: "BD", darkInput: true, inputType: "select" },
  { key: "dca", label: "DCA", inputType: "select" },
  { key: "dcb", label: "DCB", darkInput: true, inputType: "select" },
  { key: "dpc", label: "DFC", inputType: "select" },
  { key: "dc", label: "DC", inputType: "select" },
  { key: "tdv", label: "TCW", inputType: "select" },
  { key: "tm", label: "TW", placeholder: "Select Value", inputType: "select" },
  { key: "tciTm", label: "TPI/TM", darkInput: true, inputType: "select" },
  { key: "travellerDia", label: "Travellers No." },
  { key: "spacer", label: "Spacer" },
  { key: "capWeight", label: "Cop Weight (Grms)" },
  { key: "spindleMotorRpm", label: "Speed Initial (RPM)" },
  { key: "empaleeColour", label: "Speed Max (RPM)" },
  { key: "traveller", label: "Empties Colour" },
  { key: "totalDraft", label: "Total Draft", darkInput: true, inputType: "select" },
];

const TYPE_2_PARAMETER_ROWS = [
  { key: "countForm", label: "Count From", inputType: "select" },
  { key: "lycraType", label: "Lycra Type" },
  { key: "lycraDraft", label: "Lycra Draft" },
  { key: "slubCode", label: "Slub Code" },
  { key: "ramp", label: "Ramp" },
  { key: "offsetOnOff", label: "Offset On/Off" },
  { key: "copOrConeCondition", label: "Cop or Cone Condition" },
  { key: "productQty", label: "Product Qty (Kgs)" },
  { key: "backplate", label: "Raving Hank" },
  { key: "battAirflow", label: "Back Roll Wheel" },
  { key: "obliquePin", label: "Change Pinion" },
  { key: "bdv", label: "BDW", inputType: "select" },
  { key: "bd", label: "BD", darkInput: true, inputType: "select", computed: true },
  { key: "t", label: "B", inputType: "select" },
  { key: "b", label: "A", darkInput: true, inputType: "select", computed: true },
  { key: "f", label: "D", inputType: "select" },
  { key: "c", label: "C", darkInput: true, inputType: "select", computed: true },
  { key: "tpiTm", label: "TPI/TM", darkInput: true, computed: true },
  { key: "windingHp", label: "Winding - E/F" },
  { key: "rollerMoved", label: "Ratchet Wheel" },
  { key: "traveller", label: "Travellers No." },
  { key: "taper", label: "Spacer" },
  { key: "spindleInitialRpm", label: "Speed Initial (RPM)" },
  { key: "spindleMtrRpm", label: "Speed Max (RPM)" },
  { key: "emptiesColour", label: "Empties Colour" },
  { key: "totalDraft", label: "Total Draft", darkInput: true, computed: true },
];

const TYPE_3_PARAMETER_ROWS = [
  { key: "countForm", label: "Count From", inputType: "select" },
  { key: "lycraType", label: "Lycra Type" },
  { key: "lycraDraft", label: "Lycra Draft" },
  { key: "slubCode", label: "Slub Code" },
  { key: "ramp", label: "Ramp" },
  { key: "offsetOnOff", label: "Offset On/Off" },
  { key: "copOrConeCondition", label: "Cop or Cone Condition" },
  { key: "productQty", label: "Product Qty (Kgs)" },
  { key: "rovingHank", label: "Raving Hank" },
  { key: "bdv", label: "BDW" },
  { key: "bd", label: "BD", darkInput: true },
  { key: "dca", label: "DCA" },
  { key: "dcb", label: "DCB", darkInput: true },
  { key: "dpc", label: "DFF" },
  { key: "dc", label: "DC" },
  { key: "tdv", label: "TCW" },
  { key: "tm", label: "TW" },
  { key: "tpiTm", label: "TPI/TM", darkInput: true },
  { key: "travellersNo", label: "Travellers No." },
  { key: "spacer", label: "Spacer" },
  { key: "copWeight", label: "Cop Weight" },
  { key: "speedInitial", label: "Speed Initial (RPM)" },
  { key: "speedMax", label: "Speed Max (RPM)" },
  { key: "emptiesColour", label: "Empties Colour" },
  { key: "totalDraft", label: "Total Draft", darkInput: true },
];

const WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE = {
  "Type 1": TYPE_1_PARAMETER_ROWS,
  "Type 2": TYPE_2_PARAMETER_ROWS,
  "Type 3": TYPE_3_PARAMETER_ROWS,
  "Type 4": TYPE_1_PARAMETER_ROWS,
};

const WHEEL_CHANGE_FIELD_MAP = {
  "Type 1": {
    referenceField: "fm_no",
    rows: {
      countForm: "count_from",
      lycraType: "lycra_type",
      lycraDraft: "lycra_draft",
      tmDisc: "slub_code",
      range: "range",
      offsetDia: "offset",
      gapsCourseCondition: "core_condition",
      diameterDoffSpeed: "production",
      rovingHank: "roving_hank",
      rh: "eow",
      bd: "epi",
      dca: "dca",
      dcb: "dcb",
      dpc: "dfc",
      dc: "dc",
      tdv: "tcw",
      tm: "tw",
      tciTm: "tpm",
      travellerDia: "travelers_no",
      spacer: "spacer",
      capWeight: "cop_weight",
      spindleMotorRpm: "speed_front",
      empaleeColour: "speed_rpm",
      traveller: "empires_colour",
      totalDraft: "total_draft",
    },
  },
  "Type 4": {
    referenceField: "fm_no",
    rows: {
      countForm: "count_from",
      lycraType: "lycra_type",
      lycraDraft: "lycra_draft",
      tmDisc: "slub_code",
      range: "range",
      offsetDia: "offset",
      gapsCourseCondition: "core_condition",
      diameterDoffSpeed: "production",
      rovingHank: "roving_hank",
      rh: "eow",
      bd: "epi",
      dca: "dca",
      dcb: "dcb",
      dpc: "dfc",
      dc: "dc",
      tdv: "tcw",
      tm: "tw",
      tciTm: "tpm",
      travellerDia: "travelers_no",
      spacer: "spacer",
      capWeight: "cop_weight",
      spindleMotorRpm: "speed_front",
      empaleeColour: "speed_rpm",
      traveller: "empires_colour",
      totalDraft: "total_draft",
    },
  },
  "Type 2": {
    referenceField: "fm_no",
    rows: {
      countForm: "count_from",
      lycraType: "lycra_type",
      lycraDraft: "lycra_draft",
      slubCode: "slub_code",
      ramp: "ramp",
      offsetOnOff: "offset",
      copOrConeCondition: "core_condition",
      productQty: "production",
      backplate: "roving_hank",
      battAirflow: "back_roll_wheel",
      obliquePin: "change_pinion",
      bdv: "edw",
      bd: "ed",
      t: "b",
      b: "a",
      f: "d",
      c: "c",
      tpiTm: "tpi_tpm",
      windingHp: "winding_kf",
      rollerMoved: "ratchet_wheel",
      traveller: "travelers_no",
      taper: "spacer",
      spindleInitialRpm: "speed_spindle",
      spindleMtrRpm: "speed_main",
      emptiesColour: "empires_colour",
      totalDraft: "total_draft",
    },
  },
  "Type 3": {
    referenceField: "fr_no",
    rows: {
      countForm: "count_from",
      lycraType: "lycra_type",
      lycraDraft: "lycra_draft",
      slubCode: "slub_code",
      ramp: "ramp",
      offsetOnOff: "offset_on_off",
      copOrConeCondition: "cop_core_condition",
      productQty: "product_qty",
      rovingHank: "roving_hank",
      bdv: "bdw",
      bd: "bd",
      dca: "dca",
      dcb: "dcb",
      dpc: "dfc",
      dc: "dc",
      tdv: "tcw",
      tm: "tw",
      tpiTm: "tpi_tm",
      travellersNo: "travelers_no",
      spacer: "spacer",
      copWeight: "cop_weight",
      speedInitial: "speed_initial",
      speedMax: "speed_max",
      emptiesColour: "empties_colour",
    },
  },
};

const WHEEL_CHANGE_NUMERIC_FIELDS = {
  "Type 1": new Set([
    "lycra_draft",
    "production",
    "roving_hank",
    "epi",
    "dcb",
    "tpm",
    "cop_weight",
    "speed_front",
    "speed_rpm",
    "total_draft",
  ]),
  "Type 4": new Set([
    "lycra_draft",
    "production",
    "roving_hank",
    "epi",
    "dcb",
    "tpm",
    "cop_weight",
    "speed_front",
    "speed_rpm",
    "total_draft",
  ]),
  "Type 2": new Set([
    "lycra_draft",
    "production",
    "roving_hank",
    "ed",
    "a",
    "c",
    "tpi_tpm",
    "winding_kf",
    "speed_spindle",
    "speed_main",
    "total_draft",
  ]),
  "Type 3": new Set([
    "lycra_draft",
    "product_qty",
    "roving_hank",
    "bd",
    "dcb",
    "tpi_tm",
    "cop_weight",
    "speed_initial",
    "speed_max",
    "total_draft",
  ]),
};

const WHEEL_CHANGE_PAYLOAD_ALIASES = {
  "Type 3": {
    bdw: ["edw"],
    product_qty: ["prodqty"],
    speed_initial: ["speedstart"],
    speed_max: ["speedmax"],
    empties_colour: ["emptycolour"],
    total_draft: ["totaldraft"],
    dca: ["ddldca"],
    dfc: ["ddldfc"],
  },
};

const WHEEL_CHANGE_DROPDOWN_KEYS = {
  countForm: [
    "count_from",
    "count_from_options",
    "varieties",
    "variety",
    "variety_names",
    "prep_variety_names",
    "prep_variety_name",
    "prep_varieties",
    "count_names",
  ],
  rh: ["bdw", "bdw_options", "edw", "edw_options"],
  bdv: ["bdw", "bdw_options", "edw", "edw_options"],
  dca: ["dca", "dca_options"],
  dpc: ["dfc", "dfc_options", "dff", "dff_options"],
  dc: ["dc", "dc_options"],
  tdv: ["tcw", "tcw_options"],
  tm: ["tw", "tw_options"],
  t: ["b", "b_options"],
  f: ["d", "d_options"],
};

const ALL_WHEEL_CHANGE_PARAMETER_ROWS = Object.values(WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE).flat();

const getTodayDate = () => new Date().toISOString().split("T")[0];

const normalizeLabel = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/colour/g, "color")
    .replace(/[^a-z0-9]+/g, "");

const getParameterInputType = (row) => {
  const label = normalizeLabel(row.label);
  if (label === "lycratype" || label === "emptiescolor") return "text";
  if (label === "offsetonoff") return "onOff";
  if (label === "coporconecondition") return "copCone";
  return "number";
};

const createWheelChangeValues = () =>
  ALL_WHEEL_CHANGE_PARAMETER_ROWS.reduce(
    (values, row) => ({
      ...values,
      [row.key]: {
        existing: "",
        proposed: "",
      },
    }),
    {}
  );

const hasTextValue = (value) => String(value ?? "").trim() !== "";
const getTextValue = (value) => String(value ?? "").trim();
const getOptionText = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return String(value).trim();
  return String(
    value.value ??
      value.label ??
      value.text ??
          value.prep_variety_name ??
      value.rf_no ??
      value.rf_number ??
      value.r_f_no ??
      value.rf_name ??
      value.fm_no ??
      value.fr_no ??
      value.mc_no ??
      value.mc_name ??
      value.machine_no ??
      value.machine_name ??
      ""
  ).trim();
};
const cleanRfLabel = (value) =>
  String(value || "")
    .trim()
    .replace(/^\d+\s*[,/-]\s*/g, "")
    .replace(/^\d+\s*\/\s*/g, "")
    .trim();
const normalizeMachineOptions = (payload) => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.machines)
        ? payload.machines
        : Array.isArray(payload?.machineOptions)
          ? payload.machineOptions
          : Array.isArray(payload?.options)
            ? payload.options
            : Array.isArray(payload?.values)
              ? payload.values
              : Array.isArray(payload?.machine_numbers)
                ? payload.machine_numbers
                : Array.isArray(payload?.mc_nos)
                  ? payload.mc_nos
                  : [];

  const seen = new Set();

  return rows
    .map((row) => {
      const machineName = getOptionText(
        row?.rf_name ??
          row?.rf_no ??
          row?.rf_number ??
          row?.mc_name ??
          row?.machine_name ??
          row?.name ??
          row?.label ??
          row?.text ??
          row?.value ??
          row?.mc_no ??
          row?.machine_no ??
          row?.machine_number ??
          row?.code ??
          row
      );
      const deptCode = getOptionText(
        row?.dept_code ??
          row?.department_code ??
          row?.dept ??
          row?.department ??
          ""
      );
      const rawValue = getOptionText(row?.mc_no ?? row?.machine_no ?? row?.machine_number ?? row?.value ?? row?.code ?? row);
      const visibleLabel = cleanRfLabel(machineName || rawValue);
      const value = rawValue || visibleLabel;

      return value
        ? {
            value,
            label: deptCode ? `${visibleLabel || value} - Dept ${deptCode}` : (visibleLabel || value),
            machineName: visibleLabel || value,
            deptCode,
          }
        : null;
    })
    .filter((option) => {
      if (!option || seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
};
const getWheelChangeMachineOptions = (payload) => normalizeMachineOptions(payload);
const normalizeLookupOptions = (payload) => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.options)
        ? payload.options
        : Array.isArray(payload?.values)
          ? payload.values
          : Array.isArray(payload?.machine_numbers)
            ? payload.machine_numbers
            : Array.isArray(payload?.rf_nos)
              ? payload.rf_nos
              : Array.isArray(payload?.rf_numbers)
                ? payload.rf_numbers
                : Array.isArray(payload?.r_f_nos)
                  ? payload.r_f_nos
                  : Array.isArray(payload?.fm_nos)
                    ? payload.fm_nos
                    : Array.isArray(payload?.fr_nos)
                      ? payload.fr_nos
                      : Array.isArray(payload?.names)
                        ? payload.names
                        : [];

  return Array.from(
    new Set(
      rows
        .map((row) =>
          getOptionText(
            row?.value ??
              row?.rf_no ??
              row?.rf_number ??
              row?.r_f_no ??
              row?.fm_no ??
              row?.fr_no ??
              row?.mc_no ??
              row?.text ??
              row
          )
        )
        .filter(Boolean)
    )
  );
};
const getFirstArray = (source, keys) => {
  if (!source || typeof source !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
};
const normalizeDropdownOptions = (rows) =>
  Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) =>
          getOptionText(
            row?.value ??
              row?.option_value ??
              row?.code ??
              row?.name ??
              row?.variety_name ??
                row?.prep_variety_name ??
              row?.count_name ??
              row?.text ??
              row
          )
        )
        .filter(Boolean)
    )
  );
const normalizeWheelChangeRecordValue = (value) =>
  value === undefined || value === null ? "" : String(value).trim();
const buildWheelChangeValuesFromRecord = (record = {}, wheelChangeType = "") => {
  const typeConfig = WHEEL_CHANGE_FIELD_MAP[wheelChangeType];
  const rows = typeConfig?.rows || {};
  const values = ALL_WHEEL_CHANGE_PARAMETER_ROWS.reduce((values, row) => {
    const fieldBase = rows[row.key];
    const existingValue = fieldBase
      ? normalizeWheelChangeRecordValue(
          record?.[`${fieldBase}_existing`] ??
            record?.[`${fieldBase}_proposed`] ??
            record?.[fieldBase]
        )
      : "";

    return {
      ...values,
      [row.key]: {
        existing: existingValue,
        proposed: "",
      },
    };
  }, {});

  return wheelChangeType === "Type 2" ? buildType2DerivedValues(values) : values;
};
const parseNumericValue = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const computeType2TpiTm = ({ b, a, d, c }) => {
  const bValue = parseNumericValue(b);
  const aValue = parseNumericValue(a);
  const dValue = parseNumericValue(d);
  const cValue = parseNumericValue(c);
  if (bValue === null || aValue === null || dValue === null || cValue === null || aValue === 0 || cValue === 0) {
    return "";
  }
  return String((28.15 * (bValue / aValue) * (dValue / cValue)).toFixed(2));
};

const computeType2TotalDraft = ({ brw, cp }) => {
  const brwValue = parseNumericValue(brw);
  const cpValue = parseNumericValue(cp);
  if (brwValue === null || cpValue === null || cpValue === 0) {
    return "";
  }
  return String((10.519 * (brwValue / cpValue)).toFixed(2));
};

const buildType2DerivedValues = (values = {}) => {
  const nextValues = { ...values };

  const existingBdw = getTextValue(nextValues.bdv?.existing);
  const proposedBdw = getTextValue(nextValues.bdv?.proposed);
  const existingB = getTextValue(nextValues.t?.existing);
  const proposedB = getTextValue(nextValues.t?.proposed);
  const existingD = getTextValue(nextValues.f?.existing);
  const proposedD = getTextValue(nextValues.f?.proposed);
  const existingBrw = getTextValue(nextValues.battAirflow?.existing);
  const proposedBrw = getTextValue(nextValues.battAirflow?.proposed);
  const existingCp = getTextValue(nextValues.obliquePin?.existing);
  const proposedCp = getTextValue(nextValues.obliquePin?.proposed);

  nextValues.bd = {
    existing: TYPE_2_BDW_TO_BD[existingBdw] || getTextValue(nextValues.bd?.existing),
    proposed: TYPE_2_BDW_TO_BD[proposedBdw] || getTextValue(nextValues.bd?.proposed),
  };

  nextValues.t = {
    existing: getTextValue(nextValues.t?.existing),
    proposed: getTextValue(nextValues.t?.proposed),
  };

  nextValues.b = {
    existing: TYPE_2_B_TO_A[existingB] || getTextValue(nextValues.b?.existing),
    proposed: TYPE_2_B_TO_A[proposedB] || getTextValue(nextValues.b?.proposed),
  };

  nextValues.c = {
    existing: TYPE_2_D_TO_C[existingD] || getTextValue(nextValues.c?.existing),
    proposed: TYPE_2_D_TO_C[proposedD] || getTextValue(nextValues.c?.proposed),
  };

  nextValues.tpiTm = {
    existing: computeType2TpiTm({ b: existingB, a: nextValues.b.existing, d: existingD, c: nextValues.c.existing }),
    proposed: computeType2TpiTm({ b: proposedB, a: nextValues.b.proposed, d: proposedD, c: nextValues.c.proposed }),
  };

  nextValues.totalDraft = {
    existing: computeType2TotalDraft({ brw: existingBrw, cp: existingCp }),
    proposed: computeType2TotalDraft({ brw: proposedBrw, cp: proposedCp }),
  };

  return nextValues;
};

const InspectionEntryIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    width="18"
    height="18"
    className={styles.titleIcon}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M3 5.5H10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3 9.5H8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M3 13.5H6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12.3 6.2L15.8 9.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path
      d="M11.4 13.9L10.9 16L13 15.5L17 11.5C17.6 10.9 17.6 9.95 17 9.35L16.15 8.5C15.55 7.9 14.6 7.9 14 8.5L11.4 11.1V13.9Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const WheelChange = forwardRef(function WheelChange(
  {
    selectedTypeName = "Wheel Change",
    typeOptions = [],
    entryId = "#SPN-001",
    onTypeChange,
  },
  ref
) {
  const [wheelChangeType, setWheelChangeType] = useState("");
  const [machineNumber, setMachineNumber] = useState("");
  const [date, setDate] = useState(getTodayDate);
  const [values, setValues] = useState(createWheelChangeValues);
  const [errors, setErrors] = useState({});
  const [machineOptions, setMachineOptions] = useState([]);
  const [dropdownOptions, setDropdownOptions] = useState({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const lastLoadedVarietyRef = useRef("");
  const activeRows = WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE[wheelChangeType] || TYPE_1_PARAMETER_ROWS;
  const referenceLabel = "R/F No.";
  const machineLookupParams = useMemo(
    () => ({
      department: "Spinning",
    }),
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(WHEEL_CHANGE_DRAFT_STORAGE_KEY) || "{}");
      if (stored && typeof stored === "object") {
        setWheelChangeType(typeof stored.wheelChangeType === "string" ? stored.wheelChangeType : "");
        setMachineNumber(typeof stored.machineNumber === "string" ? stored.machineNumber : "");
        setDate(typeof stored.date === "string" && stored.date ? stored.date : getTodayDate());
        setValues({
          ...createWheelChangeValues(),
          ...(stored.values && typeof stored.values === "object" ? stored.values : {}),
        });
      }
    } catch {
      // Ignore invalid stored drafts.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(
      WHEEL_CHANGE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        wheelChangeType,
        machineNumber,
        date,
        values,
      })
    );
  }, [date, draftLoaded, machineNumber, values, wheelChangeType]);

  const selectedVariety = String(values.countForm?.existing || values.countForm?.proposed || "").trim();

  const clearFieldError = (field) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clearValueError = (rowKey, column) => {
    setErrors((current) => {
      const rowErrors = current.values?.[rowKey];
      if (!rowErrors?.[column]) return current;

      const next = { ...current };
      const nextValues = { ...(next.values || {}) };
      const nextRow = { ...nextValues[rowKey] };
      delete nextRow[column];

      if (Object.keys(nextRow).length) nextValues[rowKey] = nextRow;
      else delete nextValues[rowKey];

      if (Object.keys(nextValues).length) next.values = nextValues;
      else delete next.values;

      return next;
    });
  };

  const setWheelChangeValue = (rowKey, column, nextValue) => {
    setValues((current) => {
      const nextValues = {
        ...current,
        [rowKey]: {
          ...(current[rowKey] || { existing: "", proposed: "" }),
          [column]: nextValue,
        },
      };

      if (wheelChangeType === "Type 2") {
        return buildType2DerivedValues(nextValues);
      }

      return nextValues;
    });
  };

  const handleIntegerChange = (setter, field) => (event) => {
    setter(sanitizeIntegerInput(event.target.value));
    clearFieldError(field);
  };

  const handleValueChange = (rowKey, column) => (event) => {
    const nextValue =
      event && typeof event === "object" && "target" in event
        ? event.target.value
        : event;
    setWheelChangeValue(rowKey, column, nextValue);
    clearValueError(rowKey, column);
  };

  const handleNumericValueChange = (rowKey, column) => (event) => {
    const nextValue = sanitizeNumericInput(event.target.value, { precision: 10, scale: 3 });
    setWheelChangeValue(rowKey, column, nextValue);
    clearValueError(rowKey, column);
  };

  const handleRadioValueChange = (rowKey, column, nextValue) => {
    setWheelChangeValue(rowKey, column, nextValue);
    clearValueError(rowKey, column);
  };

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      fetchSpinningMachineNumberOptions({
        screen: "rsm-lycra-online",
        ...machineLookupParams,
      }),
      fetchSpinningWheelChangeDropdown(wheelChangeType, machineLookupParams),
    ]).then(([machineResult, dropdownResult]) => {
      if (!isMounted) return;

      const machineOptionSources = [];

      machineOptionSources.push(
        STATIC_RF_NO_OPTIONS.map((value) => ({ value, label: value }))
      );

      if (machineResult.status === "fulfilled") {
        machineOptionSources.push(getWheelChangeMachineOptions(machineResult.value));
      }

      if (dropdownResult.status === "fulfilled") {
        const dropdownValue = dropdownResult.value || {};
        setDropdownOptions(dropdownValue);
        machineOptionSources.push(getWheelChangeMachineOptions(dropdownValue));
      } else {
        setDropdownOptions({});
      }

      setMachineOptions(
        Array.from(
          new Map(
            machineOptionSources
              .flat()
              .filter((option) => option?.value)
              .map((option) => [option.value, option])
          ).values()
        )
      );
    });

    return () => {
      isMounted = false;
    };
  }, [machineLookupParams, wheelChangeType]);

  useEffect(() => {
    if (!wheelChangeType || !selectedVariety) {
      lastLoadedVarietyRef.current = "";
      return;
    }

    const selectionKey = `${wheelChangeType}::${selectedVariety}`;
    if (lastLoadedVarietyRef.current === selectionKey) return;

    let cancelled = false;

    fetchSpinningWheelChangeLatestRecord(wheelChangeType, {
      variety: selectedVariety,
      variety_name: selectedVariety,
      mixing: selectedVariety,
    })
      .then((latestRecord) => {
        if (cancelled || !latestRecord) return;

        lastLoadedVarietyRef.current = selectionKey;
        setMachineNumber((current) => current || getTextValue(
          latestRecord?.[WHEEL_CHANGE_FIELD_MAP[wheelChangeType]?.referenceField] ||
            latestRecord?.machine_no ||
            latestRecord?.machine_number ||
            latestRecord?.mc_no ||
            ""
        ));
        setValues((current) => {
          const nextValues = buildWheelChangeValuesFromRecord(latestRecord, wheelChangeType);
          return {
            ...nextValues,
            countForm: {
              existing: selectedVariety,
              proposed: current.countForm?.proposed || "",
            },
          };
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedVariety, wheelChangeType]);

  const clear = () => {
    setWheelChangeType("");
    setMachineNumber("");
    setDate(getTodayDate());
    setValues(createWheelChangeValues());
    setErrors({});
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(WHEEL_CHANGE_DRAFT_STORAGE_KEY);
    }
  };

  const validate = () => {
    const nextErrors = {};

    if (!selectedTypeName) nextErrors.selectedTypeName = true;
    if (!wheelChangeType.trim()) nextErrors.wheelChangeType = true;
    if (!date) nextErrors.date = true;
    if (!machineNumber.trim()) nextErrors.machineNumber = true;

    const valueErrors = {};
    activeRows.forEach((row) => {
      const rowValues = values[row.key] || {};
      const rowErrors = {};
      if (!hasTextValue(rowValues.existing)) rowErrors.existing = true;
      if (!hasTextValue(rowValues.proposed)) rowErrors.proposed = true;

      if (getParameterInputType(row) === "number") {
        if (hasTextValue(rowValues.existing) && parseNumericValue(rowValues.existing) === null) {
          rowErrors.existing = true;
        }
        if (hasTextValue(rowValues.proposed) && parseNumericValue(rowValues.proposed) === null) {
          rowErrors.proposed = true;
        }
      }

      if (Object.keys(rowErrors).length > 0) valueErrors[row.key] = rowErrors;
    });

    if (Object.keys(valueErrors).length > 0) nextErrors.values = valueErrors;

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPayload = () => {
    const typeFieldConfig = WHEEL_CHANGE_FIELD_MAP[wheelChangeType];
    const typeCode = WHEEL_CHANGE_API_TYPES[wheelChangeType];
    const numericFields = WHEEL_CHANGE_NUMERIC_FIELDS[wheelChangeType] || new Set();
    const aliases = WHEEL_CHANGE_PAYLOAD_ALIASES[wheelChangeType] || {};
    const setPayloadValue = (fieldName, suffix, value) => {
      const key = suffix ? `${fieldName}_${suffix}` : fieldName;
      payload[key] = value;

      (aliases[fieldName] || []).forEach((alias) => {
        payload[suffix ? `${alias}_${suffix}` : alias] = value;
      });
    };

    if (!typeFieldConfig || !typeCode) {
      return {
        entry_id: entryId,
        type: selectedTypeName,
        wheel_change_type: "",
        date: date || getTodayDate(),
        test_no: "",
      };
    }

    const payload = {
      entry_id: entryId,
      type: selectedTypeName,
      wheel_change_type: typeCode,
      date: date || getTodayDate(),
      test_no: "",
      [typeFieldConfig.referenceField]: getTextValue(machineNumber),
      machine_no: getTextValue(machineNumber),
      machine_number: getTextValue(machineNumber),
      mc_no: getTextValue(machineNumber),
    };

    activeRows.forEach((row) => {
      const fieldBase = typeFieldConfig.rows[row.key];
      if (!fieldBase) return;
      const existingValue = getTextValue(values[row.key]?.existing);
      const proposedValue = getTextValue(values[row.key]?.proposed);

      if (numericFields.has(fieldBase)) {
        setPayloadValue(fieldBase, "existing", parseNumericValue(existingValue));
        setPayloadValue(fieldBase, "proposed", parseNumericValue(proposedValue));
        return;
      }

      setPayloadValue(fieldBase, "existing", existingValue);
      setPayloadValue(fieldBase, "proposed", proposedValue);
    });

    return payload;
  };

  const getPreviewData = () => [
    { label: "Checking Type", value: selectedTypeName || "-" },
    { label: "Wheel Change Type", value: wheelChangeType || "-" },
    { label: "Entry ID", value: entryId || "#SPN-001" },
    { label: referenceLabel, value: machineNumber || "-" },
    ...activeRows.flatMap((row) => [
      { label: `${row.label} - Existing`, value: values[row.key]?.existing || "-" },
      { label: `${row.label} - Proposed`, value: values[row.key]?.proposed || "-" },
    ]),
  ];

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPayload,
    getPreviewData,
  }));

  const renderControl = (row, column) => {
    const value = values[row.key]?.[column] || "";
    const parameterInputType = getParameterInputType(row);
    const className = `${styles.input} ${row.darkInput ? styles.darkInput : ""} ${
      errors.values?.[row.key]?.[column] ? styles.errorInput : ""
    }`;
    const isType4NonCountDropdown =
      wheelChangeType === "Type 4" && row.key !== "countForm";
    const shouldUseSelect =
      row.inputType === "select" &&
      !isType4NonCountDropdown &&
      (wheelChangeType !== "Type 1" || !["tdv", "tm", "tciTm"].includes(row.key) || Boolean(machineNumber));

    if (shouldUseSelect) {
      const optionKeys = WHEEL_CHANGE_DROPDOWN_KEYS[row.key] || [];
      const dynamicDropdownOptions = getType1MachineSpecificOptions(row.key, machineNumber);
      const staticDropdownOptions = [
        ...(STATIC_TYPE_1_DROPDOWN_OPTIONS[row.key] || []),
        ...(STATIC_TYPE_2_DROPDOWN_OPTIONS[row.key] || []),
      ].map((option) => String(option));
      const options = normalizeDropdownOptions([
        ...dynamicDropdownOptions,
        ...staticDropdownOptions,
        ...getFirstArray(dropdownOptions, optionKeys),
        ...(Array.isArray(dropdownOptions?.fixed_options?.[row.key])
          ? dropdownOptions.fixed_options[row.key]
          : []),
      ]);

      return (
        <SearchableSelect
          className={className}
          value={value}
          onChange={handleValueChange(row.key, column)}
          options={options}
          placeholder="Select"
          ariaLabel={row.label}
          dropUp={row.key === "totalDraft"}
          disabled={row.computed === true}
        />
      );
    }

    const isReadOnly = row.computed === true;

    return (
      <input
        type={parameterInputType === "number" ? "number" : "text"}
        inputMode={parameterInputType === "number" ? "decimal" : undefined}
        step={parameterInputType === "number" ? "any" : undefined}
        placeholder={row.placeholder || ""}
        className={className}
        value={value}
        readOnly={isReadOnly}
        onChange={
          parameterInputType === "number"
            ? handleNumericValueChange(row.key, column)
            : handleValueChange(row.key, column)
        }
      />
    );
  };

  return (
    <>
      <div className={styles.titleRow}>
        <InspectionEntryIcon />
        <h3 className={styles.sectionTitle}>Inspection Data Entry</h3>
        <InputScreenUploadButton className="ml-auto" />
      </div>

      <div className={styles.form}>
        <div className={styles.row}>
          <div className={styles.field}>
            <label>Type</label>
            <select
              className={`${styles.topInput} ${errors.selectedTypeName ? styles.errorInput : ""}`}
              value={selectedTypeName}
              onChange={(event) => onTypeChange?.(event.target.value)}
            >
              <option value="">Select checking type</option>
              {typeOptions.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.displayName ?? item.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Wheel Change Type</label>
            <select
              className={`${styles.topInput} ${errors.wheelChangeType ? styles.errorInput : ""}`}
              value={wheelChangeType}
              onChange={(event) => {
                setWheelChangeType(event.target.value);
                clearFieldError("wheelChangeType");
              }}
            >
              <option value="">Select wheel change type</option>
              {WHEEL_CHANGE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label>Entry ID</label>
            <input
              type="text"
              className={styles.topInput}
              value={entryId || "#SPN-001"}
              readOnly
              disabled
            />
          </div>

          <div className={styles.field}>
            <label>{referenceLabel}</label>
            <SearchableSelect
              className={`${styles.topInput} ${errors.machineNumber ? styles.errorInput : ""}`}
              value={machineNumber}
              onChange={(value) => {
                setMachineNumber(value);
                clearFieldError("machineNumber");
              }}
              options={machineOptions}
              placeholder={`Select ${referenceLabel}`}
              ariaLabel={referenceLabel}
            />
          </div>

          <div className={styles.field} aria-hidden="true" />
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>PARAMETER</th>
                <th>EXISTING</th>
                <th>PROPOSED</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((row) => (
                <tr key={row.key}>
                  <td className={styles.parameter}>{row.label}</td>
                  <td>{renderControl(row, "existing")}</td>
                  <td>{renderControl(row, "proposed")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
});

export default WheelChange;
