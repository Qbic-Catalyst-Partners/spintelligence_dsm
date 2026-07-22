import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import SearchableSelect from "@/components/SearchableSelect";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import NotebookCustomFields from "@/components/NotebookCustomFields";
import {
  fetchSpinningWheelChangeDropdown,
  fetchSpinningWheelChangeLatestRecord,
} from "@/apis/spinning";
import { sanitizeIntegerInput, sanitizeNumericInput } from "@/utils/inputValidation";
import { saveNotebookCustomFieldValuesApi } from "@/apis/notebookCustomFieldsApi";
import styles from "@/styles/spinningWheelChange.module.css";

const WHEEL_CHANGE_TYPES = ["Type 1", "Type 2", "Type 3"];
const WHEEL_CHANGE_API_TYPES = {
  "Type 1": "type1",
  "Type 2": "type2",
  "Type 3": "type3",
};
// Bumped to _v2 to invalidate any stale cached drafts from before the
// pending/rejected approval workflow existed — old-keyed drafts are simply
// never read and get swept away below.
const WHEEL_CHANGE_DRAFT_STORAGE_KEY = "spinning_wheel_change_last_values_v2";
const WHEEL_CHANGE_DRAFT_STORAGE_KEY_LEGACY = "spinning_wheel_change_last_values";
// Per "Wheel change Spinning" master data: each R/F No. belongs to exactly
// one wheel change type — Wheel Change Type is picked first, and the
// Machine No. dropdown is scoped to that type's R/F Nos. (see
// MACHINE_OPTIONS_BY_WHEEL_CHANGE_TYPE below).
const RF_NUMBERS_BY_WHEEL_CHANGE_TYPE = {
  "Type 1": [1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 24],
  "Type 2": [4, 5, 6, 7, 18, 19, 25],
  "Type 3": [21, 22, 23],
};
const STATIC_TYPE_1_DROPDOWN_OPTIONS = {
  rh: ["40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68"],
  bd: ["1.92", "1.87", "1.83", "1.79", "1.75", "1.71", "1.67", "1.63", "1.60", "1.57", "1.54", "1.51", "1.48", "1.45", "1.42", "1.40", "1.37", "1.35", "1.32", "1.30", "1.28", "1.26", "1.24", "1.22", "1.20", "1.18", "1.16", "1.15", "1.13"],
  dca: ["43", "53", "67", "35", "82"],
  dcb: ["127", "117", "103", "135", "88"],
  dpc: ["132", "133", "134", "135"],
  dc: [
    "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "70",
  ],
  totalDraft: [
    "26.11", "26.3", "26.49", "26.5", "26.69", "26.7", "26.89", "27.08", "27.09", "27.28", "27.48", "27.49", "27.69", "27.9", "28.11", "28.32", "28.33", "28.54", "28.75", "28.77", "28.99", "29.2", "29.23", "29.45", "29.67", "29.7", "29.92", "30.15", "30.19", "30.41", "30.64", "30.69", "30.92", "31.15", "31.21", "31.44", "31.68", "31.75", "31.99", "32.22", "32.3", "32.55", "32.79", "32.88", "33.13", "33.38", "33.48", "33.73", "33.98", "34.1", "34.35", "34.61", "34.74", "35", "35.26", "35.41", "35.68", "35.94", "36.1", "36.38", "36.65", "36.83", "37.1", "37.38", "37.58", "37.86", "38.14", "38.36", "38.65", "38.94", "39.18", "39.47", "39.77", "40.03", "40.92", "41.23", "41.53", "41.85", "42.16", "42.48", "42.82", "43.14", "43.47", "43.84", "44.17", "44.5", "44.91", "45.25", "45.59", "46.03", "46.38", "46.73", "47.21", "47.57", "47.92", "48.46", "48.82", "49.18", "49.77", "50.14", "50.51", "51.15", "51.53", "51.92", "52.61", "53", "53.4", "54.16", "54.56", "54.97", "55.8", "56.22", "56.64", "57.54", "57.97", "58.41", "59.4", "59.84", "60.29", "61.38", "61.84", "62.3",
  ],
};
// Type 1 and Type 2 have independent BDW->BD conversion tables even though
// their BDW ranges overlap (both run 40-68) — Type 1 keeps its original
// values here, distinct from Type 2's own TYPE_2_BDW_TO_BD below.
const TYPE_1_BDW_TO_BD = STATIC_TYPE_1_DROPDOWN_OPTIONS.rh.reduce((map, bdw, index) => {
  map[bdw] = STATIC_TYPE_1_DROPDOWN_OPTIONS.bd[index];
  return map;
}, {});
const TYPE_2_BDW_TO_BD = {
  "40": "1.68",
  "41": "1.64",
  "42": "1.60",
  "43": "1.56",
  "44": "1.52",
  "45": "1.49",
  "46": "1.46",
  "47": "1.43",
  "48": "1.40",
  "49": "1.37",
  "50": "1.34",
  "51": "1.31",
  "52": "1.29",
  "53": "1.27",
  "54": "1.24",
  "55": "1.22",
  "56": "1.20",
  "57": "1.18",
  "58": "1.16",
  "59": "1.14",
  "60": "1.12",
  "61": "1.10",
  "62": "1.08",
  "63": "1.06",
  "64": "1.05",
  "65": "1.03",
  "66": "1.02",
  "67": "1.00",
  "68": "0.99",
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
const TYPE_1_DCA_TO_DCB = {
  "43": "127",
  "53": "117",
  "67": "103",
  "35": "135",
  "82": "88",
};
const isType1FrameNumberThree = (machineNumber) => {
  const numeric = Number.parseInt(String(machineNumber ?? "").replace(/\D/g, ""), 10);
  return numeric === 3;
};
const getType1MachineSpecificOptions = (rowKey, machineNumber = "") => {
  if (rowKey === "tdv") return TYPE_1_TCW_OPTIONS;
  if (rowKey === "tm") return TYPE_1_TW_OPTIONS;
  if (rowKey === "tciTm") return TYPE_1_TPI_OPTIONS[isType1FrameNumberThree(machineNumber) ? "3" : "default"] || TYPE_1_TPI_OPTIONS.default;
  return [];
};
const getType1TpiTm = ({ tcw, tw, machineNumber }) => {
  const tcwIndex = TYPE_1_TCW_OPTIONS.indexOf(String(tcw ?? "").trim());
  const twValue = Number.parseFloat(String(tw ?? "").trim());
  if (tcwIndex === -1 || !Number.isFinite(twValue)) return "";
  const twIndex = Math.round(twValue) - 30;
  if (twIndex < 0 || twIndex >= TYPE_1_TW_OPTIONS.length) return "";
  const group = TYPE_1_TPI_OPTIONS[isType1FrameNumberThree(machineNumber) ? "3" : "default"] || TYPE_1_TPI_OPTIONS.default;
  return group[tcwIndex * TYPE_1_TW_OPTIONS.length + twIndex] || "";
};
const TYPE_1_TOTAL_DRAFT_CONSTANT = 4.6875;
const computeType1TotalDraft = ({ dca, dcb, dfc, dc }) => {
  const dcaValue = Number.parseFloat(String(dca ?? "").trim());
  const dcbValue = Number.parseFloat(String(dcb ?? "").trim());
  const dfcValue = Number.parseFloat(String(dfc ?? "").trim());
  const dcValue = Number.parseFloat(String(dc ?? "").trim());
  if (
    !Number.isFinite(dcaValue) ||
    !Number.isFinite(dcbValue) ||
    !Number.isFinite(dfcValue) ||
    !Number.isFinite(dcValue) ||
    dcaValue === 0 ||
    dcValue === 0
  ) {
    return "";
  }
  return String((TYPE_1_TOTAL_DRAFT_CONSTANT * (dcbValue / dcaValue) * (dfcValue / dcValue)).toFixed(2));
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
  { key: "rovingHank", label: "Roving Hank" },
  { key: "rh", label: "BDW", inputType: "select" },
  { key: "bd", label: "BD", darkInput: true, inputType: "select", computed: true },
  { key: "dca", label: "DCA", inputType: "select" },
  { key: "dcb", label: "DCB", darkInput: true, inputType: "select", computed: true },
  { key: "dpc", label: "DFC", inputType: "select" },
  { key: "dc", label: "DC", inputType: "select" },
  { key: "tdv", label: "TCW", inputType: "select" },
  { key: "tm", label: "TW", placeholder: "Select Value", inputType: "select" },
  { key: "tciTm", label: "TPI/TM", darkInput: true, inputType: "select", computed: true },
  { key: "travellerDia", label: "Travellers No." },
  { key: "spacer", label: "Spacer" },
  { key: "capWeight", label: "Cop Weight (Grms)" },
  { key: "spindleMotorRpm", label: "Speed Initial (RPM)" },
  { key: "empaleeColour", label: "Speed Max (RPM)" },
  { key: "traveller", label: "Empties Colour" },
  { key: "totalDraft", label: "Total Draft", darkInput: true, computed: true },
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
  { key: "windingLengthMeters", label: "Winding length in meters" },
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
      // Backend's spinning.wheel_change_v2 table stores this under winding_kf_existing/proposed
      // (not winding_length_meters) — the mismatch meant every "Winding length in meters" entry
      // was silently dropped on submit and never actually reached the database.
      windingLengthMeters: "winding_kf",
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
      // Was missing entirely — TYPE_3_PARAMETER_ROWS has a "Total Draft" row, but with no
      // mapping here getPayload's `if (!fieldBase) return;` guard skipped it silently, so every
      // Type 3 submission's Total Draft was dropped and never reached total_draft_existing/proposed.
      totalDraft: "total_draft",
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
  if (
    label === "lycratype" ||
    label === "emptiescolor" ||
    label === "spacer" ||
    label === "travellersno"
  )
    return "text";
  if (label === "offsetonoff") return "onOff";
  if (label === "coporconecondition") return "copCone";
  return "number";
};

const isNumericParameterRow = (row) =>
  typeof row.numeric === "boolean" ? row.numeric : getParameterInputType(row) === "number";

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
// Mirrors the backend's formatRfMachineName so every source (COTS RF list,
// machine master, wheel-change dropdown, static fallback) renders the same
// "R/F NO 01" shape instead of raw machine names like "1/R.F.NO.01".
const cleanRfLabel = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";

  const rfMatch = text.match(/\bR\s*\/?\s*F\s*(?:NO\.?|NUMBER|#)?\s*0*(\d{1,3})\b/i);
  if (rfMatch) {
    return `R/F NO ${String(Number(rfMatch[1])).padStart(2, "0")}`;
  }

  return text
    .replace(/^\d+\s*[,/-]\s*/g, "")
    .replace(/^\d+\s*\/\s*/g, "")
    .trim();
};
// The full Machine No. dropdown: every R/F No. across the Type 1/2/3 mapping
// (RF_NUMBERS_BY_WHEEL_CHANGE_TYPE), sorted numerically.
const ALL_RF_MACHINE_OPTIONS = Object.values(RF_NUMBERS_BY_WHEEL_CHANGE_TYPE)
  .flat()
  .sort((a, b) => a - b)
  .map((rfNumber) => {
    const label = cleanRfLabel(`R/F NO ${rfNumber}`);
    return { value: label, label, machineName: label };
  });
// Machine No. options scoped to the selected Wheel Change Type — Type is
// picked first, then this narrows the dropdown to just that type's R/F Nos.
const MACHINE_OPTIONS_BY_WHEEL_CHANGE_TYPE = Object.entries(RF_NUMBERS_BY_WHEEL_CHANGE_TYPE).reduce(
  (map, [type, rfNumbers]) => {
    map[type] = rfNumbers
      .slice()
      .sort((a, b) => a - b)
      .map((rfNumber) => {
        const label = cleanRfLabel(`R/F NO ${rfNumber}`);
        return { value: label, label, machineName: label };
      });
    return map;
  },
  {}
);
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
const buildWheelChangeValuesFromRecord = (record = {}, wheelChangeType = "", machineNumber = "") => {
  const typeConfig = WHEEL_CHANGE_FIELD_MAP[wheelChangeType];
  const rows = typeConfig?.rows || {};
  const values = ALL_WHEEL_CHANGE_PARAMETER_ROWS.reduce((values, row) => {
    const fieldBase = rows[row.key];
    // The last approved record's own "_proposed" values are what's actually
    // in effect now — its "_existing" is the pre-approval baseline from
    // before that change, so a new entry must carry the proposed value
    // forward as its Existing, not the older one.
    const existingValue = fieldBase
      ? normalizeWheelChangeRecordValue(
          record?.[`${fieldBase}_proposed`] ??
            record?.[`${fieldBase}_existing`] ??
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

  if (wheelChangeType === "Type 2") return buildType2DerivedValues(values);
  if (wheelChangeType === "Type 1") return buildType1DerivedValues(values, machineNumber);
  return values;
};
// A pending (not-yet-L2-approved) record only supplies the Proposed column —
// its Existing baseline is whatever was last approved, already carried in
// `baseValues`. Overlaying it lets an operator see (and knowingly overwrite)
// the submission still sitting in the temporary/pending table.
const buildWheelChangeProposedValuesFromRecord = (record = {}, wheelChangeType = "", machineNumber = "", baseValues = {}) => {
  const typeConfig = WHEEL_CHANGE_FIELD_MAP[wheelChangeType];
  const rows = typeConfig?.rows || {};
  const values = ALL_WHEEL_CHANGE_PARAMETER_ROWS.reduce((values, row) => {
    const fieldBase = rows[row.key];
    const proposedValue = fieldBase
      ? normalizeWheelChangeRecordValue(record?.[`${fieldBase}_proposed`] ?? record?.[fieldBase])
      : "";

    return {
      ...values,
      [row.key]: {
        existing: getTextValue(baseValues?.[row.key]?.existing),
        proposed: proposedValue,
      },
    };
  }, {});

  if (wheelChangeType === "Type 2") return buildType2DerivedValues(values);
  if (wheelChangeType === "Type 1") return buildType1DerivedValues(values, machineNumber);
  return values;
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

const buildType1DerivedValues = (values = {}, machineNumber = "") => {
  const nextValues = { ...values };

  const existingBdw = getTextValue(nextValues.rh?.existing);
  const proposedBdw = getTextValue(nextValues.rh?.proposed);
  nextValues.bd = {
    existing: TYPE_1_BDW_TO_BD[existingBdw] || getTextValue(nextValues.bd?.existing),
    proposed: TYPE_1_BDW_TO_BD[proposedBdw] || getTextValue(nextValues.bd?.proposed),
  };

  const existingDca = getTextValue(nextValues.dca?.existing);
  const proposedDca = getTextValue(nextValues.dca?.proposed);
  nextValues.dcb = {
    existing: TYPE_1_DCA_TO_DCB[existingDca] || getTextValue(nextValues.dcb?.existing),
    proposed: TYPE_1_DCA_TO_DCB[proposedDca] || getTextValue(nextValues.dcb?.proposed),
  };

  nextValues.tciTm = {
    existing:
      getType1TpiTm({ tcw: nextValues.tdv?.existing, tw: nextValues.tm?.existing, machineNumber }) ||
      getTextValue(nextValues.tciTm?.existing),
    proposed:
      getType1TpiTm({ tcw: nextValues.tdv?.proposed, tw: nextValues.tm?.proposed, machineNumber }) ||
      getTextValue(nextValues.tciTm?.proposed),
  };

  nextValues.totalDraft = {
    existing:
      computeType1TotalDraft({
        dca: existingDca,
        dcb: nextValues.dcb.existing,
        dfc: getTextValue(nextValues.dpc?.existing),
        dc: getTextValue(nextValues.dc?.existing),
      }) || getTextValue(nextValues.totalDraft?.existing),
    proposed:
      computeType1TotalDraft({
        dca: proposedDca,
        dcb: nextValues.dcb.proposed,
        dfc: getTextValue(nextValues.dpc?.proposed),
        dc: getTextValue(nextValues.dc?.proposed),
      }) || getTextValue(nextValues.totalDraft?.proposed),
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
    onWheelChangeTypeChange,
  },
  ref
) {
  const user = useSelector((state) => state.auth?.user);
  const operatorName = getTextValue(user?.name || user?.full_name || user?.user_name || user?.username || "");
  const [customFieldValues, setCustomFieldValues] = useState({});

  const handleCustomFieldChange = (fieldId, value) => {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const saveCustomFields = async (linkedEntryId) => {
    const targetEntryId = linkedEntryId || entryId;
    const customFieldEntries = Object.entries(customFieldValues).filter(([, v]) => String(v ?? '').trim() !== '');
    if (!targetEntryId || !customFieldEntries.length) return;
    try {
      await saveNotebookCustomFieldValuesApi(
        targetEntryId,
        customFieldEntries.map(([customFieldId, value]) => ({ custom_field_id: customFieldId, value }))
      );
    } catch (customFieldError) {
      console.error("Failed to save custom field values:", customFieldError);
    }
  };

  const [wheelChangeType, setWheelChangeType] = useState("");
  const [machineNumber, setMachineNumber] = useState("");
  const [testNo, setTestNo] = useState("");
  const [date, setDate] = useState(getTodayDate);
  const [values, setValues] = useState(createWheelChangeValues);
  const [errors, setErrors] = useState({});
  const [machineOptions, setMachineOptions] = useState([]);
  const [dropdownOptions, setDropdownOptions] = useState({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  // Tracks whether the user has actually picked a Count From value (vs. it
  // merely being auto-filled for display by the machine-only lookup below) —
  // using this instead of "is countForm's text non-empty" as the machine-only
  // effect's guard, since auto-filling Count From for display would otherwise
  // make it look user-picked and permanently block that effect from ever
  // re-running on a later machine switch.
  const [countFromUserPicked, setCountFromUserPicked] = useState(false);
  // The most recent *unapproved* submission for the selected variety, if any
  // — either still awaiting L2 review or previously rejected. Either way it
  // is still the row sitting in the temp table, so its Proposed values are
  // shown (and will be silently overwritten on the next submit).
  const [unapprovedEntry, setUnapprovedEntry] = useState(null);
  const lastLoadedVarietyRef = useRef("");
  const lastLoadedMachineOnlyRef = useRef("");
  const previousWheelChangeTypeRef = useRef(null);
  // selectedVariety is a derived string, so re-picking the *same* mixing (or
  // it already being selected on revisit) never changes the value and the
  // lookup effect below never re-fires - it just keeps showing whatever was
  // fetched the first time that mixing was ever selected in this session,
  // even if a newer entry for it was saved afterward. Bumping this on every
  // focus of the Mixing field forces a fresh fetch of the current latest
  // entry regardless of whether the text value actually changed.
  const [varietyRefreshTick, setVarietyRefreshTick] = useState(0);
  const refreshSelectedVariety = () => setVarietyRefreshTick((tick) => tick + 1);
  const activeRows = WHEEL_CHANGE_PARAMETER_ROWS_BY_TYPE[wheelChangeType] || TYPE_1_PARAMETER_ROWS;
  const referenceLabel = "R/F No.";
  const machineLookupParams = useMemo(
    () => ({
      department: "Spinning",
    }),
    []
  );

  // Type 1-4 each post to their own backend table (see WHEEL_CHANGE_API_TYPES
  // above); report the current selection up so the parent can reserve the
  // Entry ID from that same table instead of a generic/shared one.
  useEffect(() => {
    onWheelChangeTypeChange?.(wheelChangeType);
  }, [onWheelChangeTypeChange, wheelChangeType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(WHEEL_CHANGE_DRAFT_STORAGE_KEY_LEGACY);
    try {
      const stored = JSON.parse(window.localStorage.getItem(WHEEL_CHANGE_DRAFT_STORAGE_KEY) || "{}");
      if (stored && typeof stored === "object") {
        setWheelChangeType(typeof stored.wheelChangeType === "string" ? stored.wheelChangeType : "");
        setMachineNumber(typeof stored.machineNumber === "string" ? stored.machineNumber : "");
        setTestNo(typeof stored.testNo === "string" ? stored.testNo : "");
        setDate(typeof stored.date === "string" && stored.date ? stored.date : getTodayDate());
        const restoredValues = {
          ...createWheelChangeValues(),
          ...(stored.values && typeof stored.values === "object" ? stored.values : {}),
        };
        setValues(restoredValues);
        setCountFromUserPicked(Boolean(String(restoredValues.countForm?.proposed ?? "").trim()));
      }
    } catch {
      // Ignore invalid stored drafts.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  // Several parameter rows share the same key across types (e.g. Type 1 and
  // Type 3 both use "dca"/"dcb"/"dc"/"tdv"/"tm" for BDW/DCA/DC/TCW/TW), so
  // switching type without clearing values left a prior type's fetched data
  // showing through under those shared keys whenever the new type had no
  // matching record to overwrite them with. Reset on every real type change
  // (skip the very first render/draft-restore, tracked via the ref) so each
  // type always starts from a clean slate.
  useEffect(() => {
    if (!draftLoaded) return;
    if (previousWheelChangeTypeRef.current === null) {
      previousWheelChangeTypeRef.current = wheelChangeType;
      return;
    }
    if (previousWheelChangeTypeRef.current === wheelChangeType) return;
    previousWheelChangeTypeRef.current = wheelChangeType;

    setValues(createWheelChangeValues());
    setUnapprovedEntry(null);
    setCountFromUserPicked(false);
    lastLoadedVarietyRef.current = "";
    lastLoadedMachineOnlyRef.current = "";
  }, [wheelChangeType, draftLoaded]);

  useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(
      WHEEL_CHANGE_DRAFT_STORAGE_KEY,
      JSON.stringify({
        wheelChangeType,
        machineNumber,
        testNo,
        date,
        values,
      })
    );
  }, [date, draftLoaded, machineNumber, testNo, values, wheelChangeType]);

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
    if (rowKey === "countForm" && column === "proposed") {
      setCountFromUserPicked(Boolean(String(nextValue ?? "").trim()));
    }
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

      if (wheelChangeType === "Type 1") {
        return buildType1DerivedValues(nextValues, machineNumber);
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

  // Machine No. options are generated entirely from the Type 1/2/3 R/F
  // mapping instead of the live COTS/master APIs — those endpoints could
  // surface machines outside this mapping. Wheel Change Type is picked
  // first, so the Machine No. dropdown is scoped to just that type's R/F
  // Nos. (MACHINE_OPTIONS_BY_WHEEL_CHANGE_TYPE); with no type selected yet
  // it shows the full R/F 1-25 list.
  useEffect(() => {
    setMachineOptions(
      wheelChangeType ? MACHINE_OPTIONS_BY_WHEEL_CHANGE_TYPE[wheelChangeType] || [] : ALL_RF_MACHINE_OPTIONS
    );
  }, [wheelChangeType]);

  // If the previously selected Machine No. doesn't belong to the newly
  // picked Wheel Change Type, drop it so a stale, out-of-scope machine can't
  // be submitted alongside the new type.
  useEffect(() => {
    if (!wheelChangeType || !machineNumber.trim()) return;
    const validOptions = MACHINE_OPTIONS_BY_WHEEL_CHANGE_TYPE[wheelChangeType] || [];
    if (!validOptions.some((option) => option.value === machineNumber)) {
      setMachineNumber("");
      clearFieldError("machineNumber");
    }
  }, [wheelChangeType]);

  // Type-specific dropdown option lists, refetched only when wheelChangeType
  // (now auto-derived from the Machine No.) actually changes.
  useEffect(() => {
    if (!wheelChangeType) {
      setDropdownOptions({});
      return;
    }

    let isMounted = true;

    fetchSpinningWheelChangeDropdown(wheelChangeType, machineLookupParams).then(
      (dropdownValue) => {
        if (!isMounted) return;
        setDropdownOptions(dropdownValue || {});
      },
      () => {
        if (isMounted) setDropdownOptions({});
      }
    );

    return () => {
      isMounted = false;
    };
  }, [wheelChangeType, machineLookupParams]);

  // Before Count From is picked, carry forward the last approved entry for
  // this Machine No. alone (scoped to the current type's table) so Existing
  // isn't blank while the operator is still filling in the rest of the form.
  // Once Count From is actually picked by the user, the variety-scoped
  // lookup below takes over and is the more specific match.
  useEffect(() => {
    if (!wheelChangeType || !machineNumber.trim() || countFromUserPicked) {
      lastLoadedMachineOnlyRef.current = "";
      return;
    }

    const trimmedMachine = machineNumber.trim();
    const selectionKey = `${wheelChangeType}::${trimmedMachine}`;
    if (lastLoadedMachineOnlyRef.current === selectionKey) return;

    // Reset immediately so a machine with no saved data shows a blank form
    // instead of leaving whatever the previously selected machine (or type)
    // had populated. If a record is found below, it overwrites this.
    lastLoadedMachineOnlyRef.current = selectionKey;
    setUnapprovedEntry(null);
    setValues(createWheelChangeValues());

    let cancelled = false;

    Promise.allSettled([
      fetchSpinningWheelChangeLatestRecord(wheelChangeType, {
        fm_no: trimmedMachine,
        fr_no: trimmedMachine,
        machine_no: trimmedMachine,
        approval_status: "approved",
        status: "approved",
      }),
      fetchSpinningWheelChangeLatestRecord(wheelChangeType, {
        fm_no: trimmedMachine,
        fr_no: trimmedMachine,
        machine_no: trimmedMachine,
        approval_status: "pending",
        status: "pending",
      }),
      fetchSpinningWheelChangeLatestRecord(wheelChangeType, {
        fm_no: trimmedMachine,
        fr_no: trimmedMachine,
        machine_no: trimmedMachine,
        approval_status: "rejected",
        status: "rejected",
      }),
    ]).then(([approvedResult, pendingResult, rejectedResult]) => {
      if (cancelled) return;

      const approvedRecord = approvedResult.status === "fulfilled" ? approvedResult.value : null;
      const pendingRecord = pendingResult.status === "fulfilled" ? pendingResult.value : null;
      const rejectedRecord = rejectedResult.status === "fulfilled" ? rejectedResult.value : null;
      const unapprovedRecord = pendingRecord || rejectedRecord;
      if (!approvedRecord && !unapprovedRecord) return;

      setUnapprovedEntry(
        unapprovedRecord
          ? {
              status: pendingRecord ? "pending" : "rejected",
              remarks: getTextValue(
                unapprovedRecord?.review_remarks ?? unapprovedRecord?.reviewRemarks ?? ""
              ),
              reviewedBy: getTextValue(
                unapprovedRecord?.reviewed_by ?? unapprovedRecord?.reviewedBy ?? ""
              ),
              reviewedAt: unapprovedRecord?.reviewed_at ?? unapprovedRecord?.reviewedAt ?? "",
            }
          : null
      );
      setValues(() => {
        let nextValues = buildWheelChangeValuesFromRecord(approvedRecord || {}, wheelChangeType, trimmedMachine);
        if (unapprovedRecord) {
          nextValues = buildWheelChangeProposedValuesFromRecord(unapprovedRecord, wheelChangeType, trimmedMachine, nextValues);
        }
        return nextValues;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [wheelChangeType, machineNumber, countFromUserPicked]);

  useEffect(() => {
    if (!wheelChangeType || !selectedVariety) {
      lastLoadedVarietyRef.current = "";
      setUnapprovedEntry(null);
      return;
    }

    // varietyRefreshTick is folded into the cache key so focusing the Mixing
    // field (see refreshSelectedVariety) always forces a fresh fetch even
    // when the mixing text itself hasn't changed.
    const selectionKey = `${wheelChangeType}::${selectedVariety}::${varietyRefreshTick}`;
    if (lastLoadedVarietyRef.current === selectionKey) return;

    let cancelled = false;

    Promise.allSettled([
      fetchSpinningWheelChangeLatestRecord(wheelChangeType, {
        variety: selectedVariety,
        variety_name: selectedVariety,
        mixing: selectedVariety,
        approval_status: "approved",
        status: "approved",
      }),
      // A submission the operator already made for this variety may still be
      // sitting in the temp/pending table awaiting L2 review, or it may have
      // been rejected (which leaves it in the same temp table, not deleted).
      // Surface whichever exists so re-submitting knowingly overwrites it
      // instead of silently losing track of it.
      fetchSpinningWheelChangeLatestRecord(wheelChangeType, {
        variety: selectedVariety,
        variety_name: selectedVariety,
        mixing: selectedVariety,
        approval_status: "pending",
        status: "pending",
      }),
      fetchSpinningWheelChangeLatestRecord(wheelChangeType, {
        variety: selectedVariety,
        variety_name: selectedVariety,
        mixing: selectedVariety,
        approval_status: "rejected",
        status: "rejected",
      }),
    ]).then(([approvedResult, pendingResult, rejectedResult]) => {
      if (cancelled) return;

      const approvedRecord = approvedResult.status === "fulfilled" ? approvedResult.value : null;
      const pendingRecord = pendingResult.status === "fulfilled" ? pendingResult.value : null;
      const rejectedRecord = rejectedResult.status === "fulfilled" ? rejectedResult.value : null;
      const unapprovedRecord = pendingRecord || rejectedRecord;
      if (!approvedRecord && !unapprovedRecord) return;

      lastLoadedVarietyRef.current = selectionKey;
      const referenceRecord = approvedRecord || unapprovedRecord;
      setMachineNumber((current) => current || getTextValue(
        referenceRecord?.[WHEEL_CHANGE_FIELD_MAP[wheelChangeType]?.referenceField] ||
          referenceRecord?.machine_no ||
          referenceRecord?.machine_number ||
          referenceRecord?.mc_no ||
          ""
      ));
      setUnapprovedEntry(
        unapprovedRecord
          ? {
              status: pendingRecord ? "pending" : "rejected",
              remarks: getTextValue(
                unapprovedRecord?.review_remarks ?? unapprovedRecord?.reviewRemarks ?? ""
              ),
              reviewedBy: getTextValue(
                unapprovedRecord?.reviewed_by ?? unapprovedRecord?.reviewedBy ?? ""
              ),
              reviewedAt: unapprovedRecord?.reviewed_at ?? unapprovedRecord?.reviewedAt ?? "",
            }
          : null
      );
      setValues((current) => {
        let nextValues = buildWheelChangeValuesFromRecord(approvedRecord || {}, wheelChangeType, machineNumber);
        if (unapprovedRecord) {
          nextValues = buildWheelChangeProposedValuesFromRecord(unapprovedRecord, wheelChangeType, machineNumber, nextValues);
        }
        return {
          ...nextValues,
          countForm: {
            existing: selectedVariety,
            proposed: current.countForm?.proposed || "",
          },
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedVariety, wheelChangeType, varietyRefreshTick]);

  const clear = () => {
    setWheelChangeType("");
    setMachineNumber("");
    setTestNo("");
    setDate(getTodayDate());
    setValues(createWheelChangeValues());
    setErrors({});
    setUnapprovedEntry(null);
    setCountFromUserPicked(false);
    setCustomFieldValues({});
    lastLoadedVarietyRef.current = "";
    lastLoadedMachineOnlyRef.current = "";
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
    if (!testNo.trim()) nextErrors.testNo = true;

    const valueErrors = {};
    activeRows.forEach((row) => {
      const rowValues = values[row.key] || {};
      const rowErrors = {};
      if (!row.computed) {
        // Existing values come from approved history; a first-time entry has
        // none, so only the proposed column is required.
        if (!hasTextValue(rowValues.proposed)) rowErrors.proposed = true;
      }

      if (isNumericParameterRow(row)) {
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
        department: "Spinning",
        approval_status: "pending",
        operator: operatorName,
        wheel_change_type: "",
        date: date || getTodayDate(),
        test_no: getTextValue(testNo),
      };
    }

    const payload = {
      entry_id: entryId,
      type: selectedTypeName,
      department: "Spinning",
      approval_status: "pending",
      operator: operatorName,
      wheel_change_type: typeCode,
      date: date || getTodayDate(),
      test_no: getTextValue(testNo),
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
    ...(unapprovedEntry
      ? [
          {
            label: "⚠ Overwrite Warning",
            value:
              unapprovedEntry.status === "rejected"
                ? "This machine/variety has a rejected entry still pending resubmission. Submitting will replace it — there is no undo."
                : "This machine/variety already has an entry awaiting L2 verification. Submitting will overwrite it — there is no undo.",
            wide: true,
          },
        ]
      : []),
    { label: "Checking Type", value: selectedTypeName || "-" },
    { label: "Wheel Change Type", value: wheelChangeType || "-" },
    { label: "Entry ID", value: entryId || "#SPN-001" },
    { label: "Test No", value: testNo || "-" },
    { label: referenceLabel, value: machineNumber || "-" },
    ...activeRows.flatMap((row) => [
      { label: `${row.label} - Existing`, value: values[row.key]?.existing || "-" },
      { label: `${row.label} - Proposed`, value: values[row.key]?.proposed || "-" },
    ]),
  ];

  useImperativeHandle(ref, () => ({
    clear,
    validate,
    getPayload: (...args) => {
      const payload = getPayload(...args);
      // getPayload is called by the parent right before it submits this
      // entry, so this is the closest available hook to "on save" for a
      // component that delegates the actual submit call upward. Custom
      // field values are saved as a side effect keyed off the same
      // entry_id the parent is about to submit with.
      saveCustomFields(payload?.entry_id);
      return payload;
    },
    getPreviewData,
    saveCustomFields,
  }));

  const renderControl = (row, column) => {
    const value = values[row.key]?.[column] || "";
    const className = `${styles.input} ${row.darkInput ? styles.darkInput : ""} ${
      errors.values?.[row.key]?.[column] ? styles.errorInput : ""
    }`;
    // TCW ("tdv") and TW ("tm") have a fixed option list regardless of
    // machine — only TPI/TM ("tciTm") actually needs the Machine No. picked
    // first, since its value set differs for Frame No. 3 vs every other
    // frame (see isType1FrameNumberThree).
    const shouldUseSelect =
      row.inputType === "select" &&
      (wheelChangeType !== "Type 1" || row.key !== "tciTm" || Boolean(machineNumber));
    // Count From (Mixing) is the one driving control: picking its Proposed
    // cell looks up the latest approved entry and fills in every row's
    // Existing baseline, including its own — so its Existing cell is
    // read-only too, same as every other row.
    const isReadOnlyExisting = column === "existing";

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
          disabled={row.computed === true || isReadOnlyExisting}
          onFocus={row.key === "countForm" ? refreshSelectedVariety : undefined}
        />
      );
    }

    const isReadOnly = row.computed === true || isReadOnlyExisting;
    const isNumericInput = isNumericParameterRow(row);

    return (
      <input
        type={isNumericInput ? "number" : "text"}
        inputMode={isNumericInput ? "decimal" : undefined}
        step={isNumericInput ? "any" : undefined}
        placeholder={row.placeholder || ""}
        className={className}
        value={value}
        readOnly={isReadOnly}
        onChange={
          isNumericInput
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
        {unapprovedEntry?.status && (
          <span
            className={`${styles.statusBadge} ${
              unapprovedEntry.status === "rejected" ? styles.statusBadgeRejected : styles.statusBadgePending
            }`}
          >
            {unapprovedEntry.status === "rejected" ? "Rejected" : "Awaiting L2"}
          </span>
        )}
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
              title="Pick the type first — Machine No. below will be scoped to it."
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
              placeholder={wheelChangeType ? `Select ${referenceLabel}` : "Select wheel change type first"}
              ariaLabel={referenceLabel}
              disabled={!wheelChangeType}
            />
          </div>

          <div className={styles.field}>
            <label>Test No</label>
            <input
              type="text"
              className={`${styles.topInput} ${errors.testNo ? styles.errorInput : ""}`}
              value={testNo}
              onChange={(event) => {
                setTestNo(event.target.value);
                clearFieldError("testNo");
              }}
              placeholder="Enter Test No"
            />
          </div>
        </div>

        {unapprovedEntry?.status === "pending" && (
          <div className={styles.pendingNotice}>
            A proposed entry for this variety is still awaiting L2 approval. The Proposed column below shows that
            pending submission — submitting again will overwrite it.
          </div>
        )}

        {unapprovedEntry?.status === "rejected" && (
          <div className={styles.rejectedNotice}>
            <div>
              This entry was rejected by L2{unapprovedEntry.reviewedBy ? ` (${unapprovedEntry.reviewedBy})` : ""}.
              {unapprovedEntry.reviewedAt ? ` Reviewed ${unapprovedEntry.reviewedAt}.` : ""} The Proposed column
              below shows the rejected submission — resubmitting will overwrite it.
            </div>
            {unapprovedEntry.remarks && (
              <div className={styles.rejectedRemarks}>Reviewer remarks: {unapprovedEntry.remarks}</div>
            )}
          </div>
        )}

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

        <NotebookCustomFields
          department="Quality Control"
          subDepartment="Spinning"
          notebook="Wheel Change"
          entryId={entryId}
          values={customFieldValues}
          onChange={handleCustomFieldChange}
        />
      </div>
    </>
  );
});

export default WheelChange;
