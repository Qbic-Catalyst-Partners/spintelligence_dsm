import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import { fetchDrawFrameMachineMaster, fetchDrawFrameUqcMasterDropdown } from "@/apis/draw-frame";
import { fetchDrawFrameWheelChangeEntries } from "@/apis/drawFrameWheelChange";
import { sanitizeBlendPercentInput, sanitizeNumericInput } from "@/utils/inputValidation";
import styles from "@/styles/drawFrameWheelChange.module.css";
import draftUtils from "@/views/draw-frame/draftUtils";

const { computeType3D50TotalDraft } = draftUtils;

const LINE_TYPES = ["Breaker", "Finisher"];
const WHEEL_CHANGE_TYPES = [
  "Type 1 (SB20)",
  "Type 2 (TD7)",
  "Type 3 (TD9)",
  "Type 1 (LRSB)",
  "Type 2 (D40)",
  "Type 3 (D50/D55)",
  "Type 4 (LDF3S)",
];
const WHEEL_CHANGE_TYPES_BY_LINE = {
  Breaker: ["Type 1 (SB20)", "Type 2 (TD7)", "Type 3 (TD9)"],
  Finisher: ["Type 1 (LRSB)", "Type 2 (D40)", "Type 3 (D50/D55)", "Type 4 (LDF3S)"],
};
const WHEEL_CHANGE_API_TYPES = {
  "Type 1 (SB20)": "type1",
  "Type 2 (TD7)": "type2",
  "Type 3 (TD9)": "type3",
  "Type 1 (LRSB)": "finisher_type1_lrsb",
  "Type 2 (D40)": "type2_d40",
  "Type 3 (D50/D55)": "type3_d50_d55",
  "Type 4 (LDF3S)": "type4_ldf3s",
};
// Bumped to _v2 to invalidate any stale cached drafts from before the
// machine_no/pending/rejected approval workflow existed — old-keyed drafts
// are simply never read and get swept away below.
const DRAFT_STORAGE_KEY = "draw_frame_wheel_change_last_values_v2";
const DRAFT_STORAGE_KEY_LEGACY = "draw_frame_wheel_change_last_values";
const TD7_LIKE_WHEEL_CHANGE_TYPES = ["Type 2 (TD7)", "Type 3 (TD9)"];

const TYPE_1_ROWS = [
  { key: "milling", label: "Mixing", inputType: "select" },
  { key: "blendPercent", label: "Blend %" },
  { key: "exHank", label: "Del-Hank" },
  { key: "feedHank", label: "Feed Hank" },
  { key: "noOfEnds", label: "No. of Ends" },
  { key: "speed", label: "Speed" },
  { key: "draftConstant", label: "Draft Constant", darkInput: true },
  { key: "md1", label: "NW1", inputType: "select" },
  { key: "md2", label: "NW2", inputType: "select" },
  { key: "totalDraft", label: "Total Draft", darkInput: true },
  { key: "bdcp", label: "BDCP (W4 / Break Draft)", inputType: "select" },
  { key: "creelTension", label: "Creel Tension (W1VWW2) / Creel Tension Draft", inputType: "select" },
  { key: "feedTension", label: "Feed Tension (W8/VEG) / Feed Tension Draft", inputType: "select" },
  { key: "webTension", label: "Web Tension (W3) / Web Tension Draft", inputType: "select" },
  { key: "trumpet", label: "Trumpet", inputType: "select" },
  { key: "bottomRollerFront", label: "Bottom Roller Setting Front Zone", inputType: "select" },
  { key: "bottomRollerBack", label: "Bottom Roller Setting Back Zone", inputType: "select" },
];

const TD7_ROWS = [
  { key: "mixing", label: "Mixing", inputType: "select" },
  { key: "blendPercent", label: "Blend %" },
  { key: "delHank", label: "Del-Hank" },
  { key: "feedHank", label: "Feed Hank" },
  { key: "noOfEnds", label: "No. of Ends" },
  { key: "speed", label: "Speed" },
  { key: "totalDraftFormula", label: "Total Draft (Formula)", darkInput: true },
  { key: "totalDraftGear", label: "Total Draft from G1/G2 Combinations", inputType: "select" },
  { key: "g1G2", label: "G1/G2", inputType: "select" },
  { key: "bdcp", label: "BDCP (C4) / Break Draft", inputType: "select" },
  { key: "webTension", label: "Web Tension (C3) / Web Tension Draft", inputType: "select" },
  { key: "trumpet", label: "Trumpet", inputType: "select" },
  { key: "bottomRollerFront", label: "Bottom Roller Setting Front Zone", inputType: "select" },
  { key: "bottomRollerBack", label: "Bottom Roller Setting Back Zone", inputType: "select" },
];

const FINISHER_TYPE_1_LRSB_ROWS = [
  { key: "lrsbMixing", label: "Mixing", inputType: "select" },
  { key: "lrsbBlendPercent", label: "Blend %" },
  { key: "lrsbDelHank", label: "Del-Hank" },
  { key: "lrsbFeedHank", label: "Feed Hank" },
  { key: "lrsbNoOfEnds", label: "No. of Ends" },
  { key: "lrsbSpeed", label: "Speed" },
  { key: "lrsbTotalDraft", label: "Total Draft", darkInput: true },
  { key: "lrsbTotalDraftConstant", label: "Total Draft Constant", darkInput: true },
  { key: "lrsbNw1", label: "NW1", inputType: "select" },
  { key: "lrsbNw2", label: "NW2", inputType: "select" },
  { key: "lrsbBreakDraft", label: "Break Draft", darkInput: true },
  { key: "lrsbBackRollerPulley", label: "Back Roller Pulley Dia (W4)", inputType: "select" },
  { key: "lrsbMiddleRollerPulley", label: "Middle Roller Pulley (VV)", inputType: "select" },
  { key: "lrsbCreelTensionDraft", label: "Creel Tension (W1) / Creel Draft", inputType: "select" },
  { key: "lrsbWebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "lrsbBottomRollerFront", label: "Bottom Roller Setting Front Zone / Gauge in MM", inputType: "select" },
  { key: "lrsbBottomRollerBack", label: "Bottom Roller Setting Back Zone / Gauge in MM", inputType: "select" },
  { key: "lrsbScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "lrsbScanningRollerLower", label: "Scanning Roller Load (kg)", inputType: "select" },
  { key: "lrsbSilverFunnel", label: "Sliver Funnel", inputType: "select" },
  { key: "lrsbWebGuideTube", label: "Web Guide Tube Dia", inputType: "select" },
  { key: "lrsbSliverWireSize", label: "Insert Bore Dia", inputType: "select" },
  { key: "lrsbTrumpet", label: "Trumpet", inputType: "select" },
];

const TYPE_2_D40_ROWS = [
  { key: "d40Mixing", label: "Mixing", inputType: "select" },
  { key: "d40BlendPercent", label: "Blend %" },
  { key: "d40DelHank", label: "Del-Hank" },
  { key: "d40FeedHank", label: "Feed Hank" },
  { key: "d40NoOfEnds", label: "No. of Ends" },
  { key: "d40Speed", label: "Speed" },
  { key: "d40TotalDraft", label: "Total Draft", darkInput: true },
  { key: "d40TotalDraftConstant", label: "Total Draft Constant", darkInput: true },
  { key: "d40Nw1", label: "NW1", inputType: "select" },
  { key: "d40Nw2", label: "NW2", inputType: "select" },
  { key: "d40BreakDraft", label: "Break Draft Wheel (W4) / Break Draft (VV)", inputType: "select" },
  { key: "d40CreelTensionDraft", label: "Creel Tension (W1) / Creel Draft", inputType: "select" },
  { key: "d40WebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "d40WebTensionPulley", label: "Feed Tension wheel (W8) / Feed Tension Draft", inputType: "select" },
  { key: "d40BottomRollerFront", label: "Bottom Roller Setting Front Zone", inputType: "select" },
  { key: "d40BottomRollerBack", label: "Bottom Roller Setting Back Zone", inputType: "select" },
  { key: "d40ScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "d40Trumpet", label: "Trumpet", inputType: "select" },
];

const TYPE_3_D50_D55_ROWS = [
  { key: "d50Mixing", label: "Mixing", inputType: "select" },
  { key: "d50BlendPercent", label: "Blend %" },
  { key: "d50DelHank", label: "Del-Hank" },
  { key: "d50FeedHank", label: "Feed Hank" },
  { key: "d50NoOfEnds", label: "No. of Ends" },
  { key: "d50Speed", label: "Speed" },
  { key: "d50TotalDraft", label: "Total Draft", darkInput: true },
  { key: "d50BreakDraft", label: "Break Draft Wheel (W4) / Break Draft", inputType: "select" },
  { key: "d50CreelTensionDraft", label: "Creel Tension (W1) / Creel Draft", inputType: "select" },
  { key: "d50WebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "d50FeedTensionDraft", label: "Feed Tension Wheel (W8) / Feed Tension Draft", inputType: "select" },
  { key: "d50BottomRollerFront", label: "Bottom Roller Setting Front Zone", inputType: "select" },
  { key: "d50BottomRollerBack", label: "Bottom Roller Setting Back Zone", inputType: "select" },
  { key: "d50ScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "d50Trumpet", label: "Trumpet", inputType: "select" },
];

const TYPE_4_LDF3S_ROWS = [
  { key: "ldf3sMixing", label: "Mixing", inputType: "select" },
  { key: "ldf3sBlendPercent", label: "Blend %" },
  { key: "ldf3sDelHank", label: "Del-Hank" },
  { key: "ldf3sFeedHank", label: "Feed Hank" },
  { key: "ldf3sNoOfEnds", label: "No. of Ends" },
  { key: "ldf3sSpeed", label: "Speed" },
  { key: "ldf3sTotalDraft", label: "Total Draft", darkInput: true },
  { key: "ldf3sBreakDraft", label: "Break Draft Wheel / Break Draft", inputType: "select" },
  { key: "ldf3sCreelTensionDraft", label: "Creel Tension (W1) / Creel Draft", inputType: "select" },
  { key: "ldf3sWebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "ldf3sFeedTensionDraft", label: "Feed Tension Wheel (W8) / Feed Tension Draft", inputType: "select" },
  { key: "ldf3sBottomRollerFront", label: "Bottom Roller Setting Front Zone / Gauge in MM", inputType: "select" },
  { key: "ldf3sBottomRollerBack", label: "Bottom Roller Setting Back Zone / Gauge in MM", inputType: "select" },
  { key: "ldf3sScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "ldf3sTrumpet", label: "Trumpet", inputType: "select" },
];

const ROWS_BY_TYPE = {
  "Type 1 (SB20)": TYPE_1_ROWS,
  "Type 2 (TD7)": TD7_ROWS,
  "Type 3 (TD9)": TD7_ROWS,
  "Type 1 (LRSB)": FINISHER_TYPE_1_LRSB_ROWS,
  "Type 2 (D40)": TYPE_2_D40_ROWS,
  "Type 3 (D50/D55)": TYPE_3_D50_D55_ROWS,
  "Type 4 (LDF3S)": TYPE_4_LDF3S_ROWS,
};

const ALL_ROWS = [
  ...TYPE_1_ROWS,
  ...TD7_ROWS,
  ...FINISHER_TYPE_1_LRSB_ROWS,
  ...TYPE_2_D40_ROWS,
  ...TYPE_3_D50_D55_ROWS,
  ...TYPE_4_LDF3S_ROWS,
];

const getTodayDate = () => new Date().toISOString().split("T")[0];

const createValues = () =>
  ALL_ROWS.reduce((values, row) => {
    values[row.key] = { existing: "", proposed: "" };
    return values;
  }, {});

const hasTextValue = (value) => String(value ?? "").trim() !== "";
const getTextValue = (value) => String(value ?? "").trim();
const parseNumericValue = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const isBlendPercentValue = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/^\d+(\.\d+)?$/.test(text)) return true;
  return /^\d+(\.\d+)?\/\d+(\.\d+)?$/.test(text);
};

const normalizeTd7DraftValue = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed.toString() : "";
};

const getTd7G1G2ForTotalDraft = (value, wheelChangeType = "") => {
  const normalizedValue = normalizeTd7DraftValue(value);
  const map = wheelChangeType === "Type 2 (TD7)" ? TD7_TOTAL_DRAFT_TO_G1_G2_MAP : TD9_TOTAL_DRAFT_TO_G1_G2_MAP;
  return map[normalizedValue] || "";
};

const applyType2Td7AutoFill = (nextValues, changedRowKey = "", wheelChangeType = "") => {
  if (!TD7_LIKE_WHEEL_CHANGE_TYPES.includes(wheelChangeType)) return nextValues;
  if (!["totalDraftGear", "totalDraftFormula"].includes(changedRowKey)) return nextValues;

  const draftValue = nextValues.totalDraftGear?.existing || nextValues.totalDraftGear?.proposed || "";
  const autoG1G2 = getTd7G1G2ForTotalDraft(draftValue, wheelChangeType);
  if (!autoG1G2) return nextValues;

  const currentExisting = nextValues.g1G2?.existing ?? "";
  const currentProposed = nextValues.g1G2?.proposed ?? "";
  if (currentExisting === autoG1G2 && currentProposed === autoG1G2) return nextValues;

  return {
    ...nextValues,
    g1G2: {
      ...(nextValues.g1G2 || { existing: "", proposed: "" }),
      existing: autoG1G2,
      proposed: autoG1G2,
    },
  };
};

const computeType1Sb20TotalDraft = ({ nw1, nw2 }) => {
  const nw1Value = parseNumericValue(nw1);
  const nw2Value = parseNumericValue(nw2);
  if (nw1Value === null || nw2Value === null || nw1Value === 0) return "";
  return String((3.993 * (nw2Value / nw1Value)).toFixed(2));
};

const computeType2D40TotalDraft = ({ nw1, nw2, totalDraftConstant }) => {
  const nw1Value = parseNumericValue(nw1);
  const nw2Value = parseNumericValue(nw2);
  const constantValue = parseNumericValue(totalDraftConstant);
  if (nw1Value === null || nw2Value === null || constantValue === null || nw1Value === 0) return "";
  return String((constantValue * (nw2Value / nw1Value)).toFixed(2));
};

const computeFinisherType1LrsbTotalDraft = ({ nw1, nw2, totalDraftConstant = "6.01" }) => {
  const nw1Value = parseNumericValue(nw1);
  const nw2Value = parseNumericValue(nw2);
  const constantValue = parseNumericValue(totalDraftConstant);
  if (nw1Value === null || nw2Value === null || constantValue === null || nw1Value === 0) return "";
  return String((constantValue * (nw2Value / nw1Value)).toFixed(2));
};

const computeFinisherType1LrsbBreakDraft = ({ backRollerPulley, middleRollerPulley }) => {
  const backRollerPulleyValue = parseNumericValue(backRollerPulley);
  const middleRollerPulleyValue = parseNumericValue(middleRollerPulley);
  if (backRollerPulleyValue === null || middleRollerPulleyValue === null || middleRollerPulleyValue === 0) return "";
  return String((backRollerPulleyValue / middleRollerPulleyValue).toFixed(2));
};

const computeType4Ldf3sTotalDraft = ({ deliveryHank, feedHank, noOfEnds }) => {
  const deliveryHankValue = parseNumericValue(deliveryHank);
  const feedHankValue = parseNumericValue(feedHank);
  const noOfEndsValue = parseNumericValue(noOfEnds);
  if (deliveryHankValue === null || feedHankValue === null || noOfEndsValue === null || feedHankValue === 0) return "";
  return String(((deliveryHankValue / feedHankValue) * noOfEndsValue).toFixed(2));
};

const DRAW_FRAME_NW_OPTIONS = Array.from({ length: 70 - 23 + 1 }, (_, index) => String(23 + index));
const DRAW_FRAME_BREAK_DRAFT_OPTIONS = [
  "77.4 / 1.05",
  "72.2 / 1.13",
  "703 / 1.16",
  "65.5 / 1.24",
  "63.8 / 1.28",
  "59.6 / 1.36",
  "57.9 / 1.41",
  "54 / 1.5",
  "52.7 / 1.55",
  "49.1 / 1.66",
  "48 / 1.7",
  "44.8 / 1.82",
  "43.5 / 1.87",
  "40.7 / 2",
  "39.6 / 2.06",
  "36.9 / 2.2",
];
const DRAW_FRAME_LRSB_NW_OPTIONS = ["35", "37", "41", "44", "46", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "70"];
const DRAW_FRAME_W1VWZ_OPTIONS = ["143.9 / 0.99", "145.3 / 1", "146.7 / 1.01", "148.1 / 1.03", "149.5 / 1.04", "152.3 / 1.06"];
const DRAW_FRAME_W3DR_OPTIONS = ["143.1 / 0.9", "141.6 / 1", "140.2 / 1.01", "138.8 / 1.02", "137.5 / 1.03"];
const DRAW_FRAME_W8DR_OPTIONS = ["79 / 0.97", "80 / 0.98", "81 / 0.99", "82 / 1", "83 / 1.02", "84 / 1.03"];
const DRAW_FRAME_W4_OPTIONS = ["31.6", "34.8", "38.3", "42.2", "46.4", "51", "56.1", "61.7"];
const DRAW_FRAME_LRSB_VV_OPTIONS = ["30", "28"];
const DRAW_FRAME_LRSB_W1_OPTIONS = ["143.9 / 0.999", "145.3 / 1.008", "146.7 / 1.018", "148.1 / 1.028", "149.5 / 1.038"];
const DRAW_FRAME_LRSB_W3_OPTIONS = ["56.6 / 0.99", "57.2 / 1", "57.8 / 1.01", "58.3 / 1.02", "58.9 / 1.03"];
const DRAW_FRAME_LRSB_BOTTOM_ROLLER_FRONT_OPTIONS = ["36 / 2.5", "37 / 3.5", "38 / 4.5", "39 / 5.5", "40 / 6.5", "41 / 7.5", "42 / 8.5", "43 / 9.5", "44 / 10.5", "45 / 11.5", "46 / 12.5", "47 / 13.5", "48 / 14.5", "49 / 15.5", "50 / 16.5", "51 / 17.5", "52 / 18.5", "53 / 19.5", "54 / 20.5", "55 / 21.5", "56 / 22.5", "57 / 23.5", "58 / 24.5", "59 / 25.5", "60 / 26.5"];
const DRAW_FRAME_LRSB_BOTTOM_ROLLER_BACK_OPTIONS = [
  "40 / 10",
  "42 / 12",
  "44 / 14",
  "46 / 16",
  "48 / 18",
  "50 / 20",
  "52 / 22",
  "54 / 24",
  "56 / 26",
  "58 / 28",
  "60 / 30",
  "62 / 32",
  "64 / 34",
  "66 / 36",
  "68 / 38",
  "70 / 40",
  "72 / 42",
  "74 / 44",
  "76 / 46",
  "78 / 48",
  "80 / 50",
  "82 / 52",
  "84 / 54",
  "86 / 56",
  "88 / 58",
];
const DRAW_FRAME_LRSB_SCANNING_ROLLER_OPTIONS = ["6", "7", "8", "9", "10"];
const DRAW_FRAME_LRSB_SCANNING_ROLLER_LOAD_OPTIONS = ["120", "140"];
const DRAW_FRAME_LRSB_SILVER_FUNNEL_OPTIONS = ["6", "7", "8", "9", "10"];
const DRAW_FRAME_LRSB_WEB_GUIDE_TUBE_OPTIONS = ["8", "10"];
const DRAW_FRAME_LRSB_INSERT_BORE_DIA_OPTIONS = ["8", "10"];
const DRAW_FRAME_TRUMPET_OPTIONS = ["3.8", "4.2", "4.6", "5"];
const DRAW_FRAME_BREAKER_TRUMPET_OPTIONS = ["3.8", "4.2"];
const DRAW_FRAME_TD7_TRUMPET_OPTIONS = ["3.8", "4.2"];
const DRAW_FRAME_TD9_TRUMPET_OPTIONS = ["3.8", "4.2"];
const DRAW_FRAME_D40_NW_OPTIONS = [
  "30",
  "35",
  "39",
  "44",
  "46",
  "47",
  "48",
  "49",
  "50",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
];
const DRAW_FRAME_D40_BREAK_DRAFT_OPTIONS = [
  { value: "54.6 / 1.05", label: "54.6 / 1.05" },
  { value: "57.2 / 1.1", label: "57.2 / 1.1" },
  { value: "59.8 / 1.15", label: "59.8 / 1.15" },
  { value: "62.4 / 1.2", label: "62.4 / 1.2" },
  { value: "65 / 1.25", label: "65 / 1.25" },
  { value: "67.6 / 1.3", label: "67.6 / 1.3" },
  { value: "70.2 / 1.35", label: "70.2 / 1.35" },
  { value: "72.8 / 1.4", label: "72.8 / 1.4" },
  { value: "78 / 1.5", label: "78 / 1.5" },
  { value: "83.2 / 1.6", label: "83.2 / 1.6" },
  { value: "88.4 / 1.7", label: "88.4 / 1.7" },
  { value: "93.6 / 1.8", label: "93.6 / 1.8" },
];
const DRAW_FRAME_D40_CREEL_TENSION_OPTIONS = [
  { value: "98 / 0.98", label: "98 / 0.98" },
  { value: "99 / 0.99", label: "99 / 0.99" },
  { value: "100 / 1", label: "100 / 1" },
  { value: "101 / 1.01", label: "101 / 1.01" },
  { value: "102 / 1.02", label: "102 / 1.02" },
  { value: "103 / 1.03", label: "103 / 1.03" },
];
const DRAW_FRAME_D40_WEB_TENSION_OPTIONS = [
  { value: "75.2 / 0.99", label: "75.2 / 0.99" },
  { value: "74.4 / 1", label: "74.4 / 1" },
  { value: "73.7 / 1.01", label: "73.7 / 1.01" },
  { value: "72.9 / 1.02", label: "72.9 / 1.02" },
  { value: "72.2 / 1.03", label: "72.2 / 1.03" },
];
const DRAW_FRAME_D40_FEED_TENSION_OPTIONS = [
  { value: "98 / 0.98", label: "98 / 0.98" },
  { value: "99 / 0.99", label: "99 / 0.99" },
  { value: "100 / 1", label: "100 / 1" },
  { value: "101 / 1.01", label: "101 / 1.01" },
  { value: "102 / 1.02", label: "102 / 1.02" },
];
const DRAW_FRAME_D40_BOTTOM_ROLLER_FRONT_OPTIONS = Array.from({ length: 75 - 35 + 1 }, (_, index) => String(35 + index));
const DRAW_FRAME_D40_BOTTOM_ROLLER_BACK_OPTIONS = Array.from({ length: 75 - 35 + 1 }, (_, index) => String(35 + index));
const DRAW_FRAME_D40_SCANNING_ROLLER_OPTIONS = ["5", "7", "9"];
const DRAW_FRAME_D40_TRUMPET_OPTIONS = ["3.8", "4.2", "4.6", "5", "5.5"];
const DRAW_FRAME_D50_BREAK_DRAFT_OPTIONS = [
  { value: "54.6 / 1.05", label: "54.6 / 1.05" },
  { value: "57.2 / 1.1", label: "57.2 / 1.1" },
  { value: "59.8 / 1.15", label: "59.8 / 1.15" },
  { value: "62.4 / 1.2", label: "62.4 / 1.2" },
  { value: "65 / 1.25", label: "65 / 1.25" },
  { value: "67.6 / 1.3", label: "67.6 / 1.3" },
  { value: "70.2 / 1.35", label: "70.2 / 1.35" },
  { value: "72.8 / 1.4", label: "72.8 / 1.4" },
  { value: "78 / 1.5", label: "78 / 1.5" },
  { value: "83.2 / 1.6", label: "83.2 / 1.6" },
  { value: "88.4 / 1.7", label: "88.4 / 1.7" },
  { value: "93.6 / 1.8", label: "93.6 / 1.8" },
];
const DRAW_FRAME_D50_CREEL_TENSION_OPTIONS = [
  { value: "54.6 / 1.05", label: "54.6 / 1.05" },
  { value: "57.2 / 1.1", label: "57.2 / 1.1" },
  { value: "59.8 / 1.15", label: "59.8 / 1.15" },
  { value: "62.4 / 1.2", label: "62.4 / 1.2" },
  { value: "65 / 1.25", label: "65 / 1.25" },
  { value: "67.6 / 1.3", label: "67.6 / 1.3" },
  { value: "70.2 / 1.35", label: "70.2 / 1.35" },
];
const DRAW_FRAME_D50_WEB_TENSION_OPTIONS = [
  { value: "71 / 0.99", label: "71 / 0.99" },
  { value: "70.3 / 1", label: "70.3 / 1" },
  { value: "69.6 / 1.01", label: "69.6 / 1.01" },
  { value: "68.9 / 1.02", label: "68.9 / 1.02" },
  { value: "68.3 / 1.03", label: "68.3 / 1.03" },
];
const DRAW_FRAME_D50_FEED_TENSION_OPTIONS = [
  { value: "98 / 0.98", label: "98 / 0.98" },
  { value: "99 / 0.99", label: "99 / 0.99" },
  { value: "100 / 1", label: "100 / 1" },
  { value: "101 / 1.01", label: "101 / 1.01" },
  { value: "102 / 1.02", label: "102 / 1.02" },
];
const DRAW_FRAME_D50_BOTTOM_ROLLER_FRONT_OPTIONS = Array.from({ length: 75 - 35 + 1 }, (_, index) => String(35 + index));
const DRAW_FRAME_D50_BOTTOM_ROLLER_BACK_OPTIONS = Array.from({ length: 75 - 35 + 1 }, (_, index) => String(35 + index));
const DRAW_FRAME_D50_SCANNING_ROLLER_OPTIONS = ["5", "7", "9"];
const DRAW_FRAME_D50_TRUMPET_OPTIONS = ["3.8", "4.2", "4.6", "5", "5.5"];
const DRAW_FRAME_LDF3S_BREAK_DRAFT_OPTIONS = [
  "57.2 / 1.1",
  "59.8 / 1.15",
  "62.4 / 1.2",
  "65 / 1.25",
  "67.6 / 1.3",
  "72.8 / 1.4",
  "78 / 1.5",
  "83.2 / 1.6",
  "88.4 / 1.7",
  "93.6 / 1.8",
];
const DRAW_FRAME_LDF3S_CREEL_TENSION_OPTIONS = ["98.7 / 1.01", "99.7 / 1.02", "100.7 / 1.03", "101.8 / 1.04"];
const DRAW_FRAME_LDF3S_WEB_TENSION_OPTIONS = ["74.2 / 0.99", "73.5 / 1", "72.8 / 1.01", "72.3 / 1.02", "71.6 / 1.03"];
const DRAW_FRAME_LDF3S_FEED_TENSION_OPTIONS = ["99 / 0.99", "100 / 1", "101 / 1.01"];
const DRAW_FRAME_LDF3S_BOTTOM_ROLLER_FRONT_OPTIONS = [
  "34 / 0.7",
  "35 / 1.6",
  "36 / 2.5",
  "37 / 3.5",
  "38 / 4.5",
  "39 / 5.5",
  "40 / 6.5",
  "41 / 7.5",
  "42 / 8.5",
  "43 / 9.5",
  "44 / 10.5",
  "45 / 11.5",
  "46 / 12.5",
  "47 / 13.5",
  "48 / 14.5",
  "49 / 15.5",
  "50 / 16.5",
  "51 / 17.5",
  "52 / 18.5",
  "53 / 19.5",
  "54 / 20.5",
  "55 / 21.5",
  "56 / 22.5",
  "57 / 23.5",
  "58 / 24.5",
  "59 / 25.5",
  "60 / 26.5",
];
const DRAW_FRAME_LDF3S_BOTTOM_ROLLER_BACK_OPTIONS = [
  "38 / 8",
  "39 / 9",
  "40 / 10",
  "42 / 12",
  "44 / 14",
  "46 / 16",
  "48 / 18",
  "50 / 20",
  "52 / 22",
  "54 / 24",
  "56 / 26",
  "58 / 28",
  "60 / 30",
  "62 / 32",
  "64 / 34",
  "66 / 36",
  "68 / 38",
  "70 / 40",
  "72 / 42",
  "74 / 44",
  "76 / 46",
  "78 / 48",
  "80 / 50",
  "82 / 52",
  "84 / 54",
  "86 / 56",
  "88 / 58",
];
const DRAW_FRAME_LDF3S_SCANNING_ROLLER_OPTIONS = ["5", "7", "9"];
const DRAW_FRAME_LDF3S_TRUMPET_OPTIONS = ["3.8", "4.2", "4.6", "5", "5.5"];
const DRAW_FRAME_TD7_TOTAL_DRAFT_OPTIONS = [
  { value: "4.0", label: "4.0" },
  { value: "4.2", label: "4.2" },
  { value: "4.3", label: "4.3" },
  { value: "4.4", label: "4.4" },
  { value: "4.6", label: "4.6" },
  { value: "4.7", label: "4.7" },
  { value: "4.8", label: "4.8" },
  { value: "5.0", label: "5.0" },
  { value: "5.1", label: "5.1" },
  { value: "5.3", label: "5.3" },
  { value: "5.5", label: "5.5" },
  { value: "5.6", label: "5.6" },
  { value: "5.7", label: "5.7" },
  { value: "5.9", label: "5.9" },
  { value: "6.0", label: "6.0" },
  { value: "6.2", label: "6.2" },
  { value: "6.4", label: "6.4" },
  { value: "6.6", label: "6.6" },
  { value: "6.8", label: "6.8" },
  { value: "7.0", label: "7.0" },
  { value: "7.2", label: "7.2" },
  { value: "7.4", label: "7.4" },
  { value: "7.6", label: "7.6" },
  { value: "7.8", label: "7.8" },
  { value: "8.0", label: "8.0" },
  { value: "8.3", label: "8.3" },
  { value: "8.5", label: "8.5" },
  { value: "8.8", label: "8.8" },
  { value: "9.0", label: "9.0" },
  { value: "9.3", label: "9.3" },
  { value: "9.6", label: "9.6" },
  { value: "10.0", label: "10.0" },
];
const TD7_TOTAL_DRAFT_TO_G1_G2_MAP = {
  "4": "43/40",
  "4.2": "41/40",
  "4.3": "40/40",
  "4.4": "39/40",
  "4.6": "38/40",
  "4.7": "37/40",
  "4.8": "36/40",
  "5": "35/40",
  "5.1": "34/40",
  "5.3": "33/40",
  "5.5": "41/31",
  "5.6": "40/31",
  "5.7": "39/31",
  "5.9": "38/31",
  "6": "37/31",
  "6.2": "36/31",
  "6.4": "35/31",
  "6.6": "34/31",
  "6.8": "33/31",
  "7": "32/31",
  "7.2": "31/31",
  "7.4": "39/24",
  "7.6": "38/24",
  "7.8": "37/24",
  "8": "36/24",
  "8.3": "35/24",
  "8.5": "34/24",
  "8.8": "33/24",
  "9": "32/24",
  "9.3": "31/24",
  "9.6": "30/24",
  "10": "29/24",
};
const DRAW_FRAME_TD7_G1_G2_OPTIONS = [
  { value: "43/40", label: "43 / 40" },
  { value: "41/40", label: "41 / 40" },
  { value: "40/40", label: "40 / 40" },
  { value: "39/40", label: "39 / 40" },
  { value: "38/40", label: "38 / 40" },
  { value: "37/40", label: "37 / 40" },
  { value: "36/40", label: "36 / 40" },
  { value: "35/40", label: "35 / 40" },
  { value: "34/40", label: "34 / 40" },
  { value: "33/40", label: "33 / 40" },
  { value: "41/31", label: "41 / 31" },
  { value: "40/31", label: "40 / 31" },
  { value: "39/31", label: "39 / 31" },
  { value: "38/31", label: "38 / 31" },
  { value: "37/31", label: "37 / 31" },
  { value: "36/31", label: "36 / 31" },
  { value: "35/31", label: "35 / 31" },
  { value: "34/31", label: "34 / 31" },
  { value: "33/31", label: "33 / 31" },
  { value: "32/31", label: "32 / 31" },
  { value: "31/31", label: "31 / 31" },
  { value: "39/24", label: "39 / 24" },
  { value: "38/24", label: "38 / 24" },
  { value: "37/24", label: "37 / 24" },
  { value: "36/24", label: "36 / 24" },
  { value: "35/24", label: "35 / 24" },
  { value: "34/24", label: "34 / 24" },
  { value: "33/24", label: "33 / 24" },
  { value: "32/24", label: "32 / 24" },
  { value: "31/24", label: "31 / 24" },
  { value: "30/24", label: "30 / 24" },
  { value: "29/24", label: "29 / 24" },
];
const DRAW_FRAME_TD7_WEB_TENSION_OPTIONS = [
  { value: "46.2 / 0.99", label: "46.2 / 0.99" },
  { value: "46.43 / 0.995", label: "46.43 / 0.995" },
  { value: "46.67 / 1", label: "46.67 / 1" },
  { value: "46.9 / 1.005", label: "46.9 / 1.005" },
  { value: "47.13 / 1.01", label: "47.13 / 1.01" },
  { value: "47.37 / 1.01", label: "47.37 / 1.01" },
  { value: "47.6 / 1.02", label: "47.6 / 1.02" },
  { value: "47.83 / 1.025", label: "47.83 / 1.025" },
  { value: "48.07 / 1.03", label: "48.07 / 1.03" },
  { value: "48.3 / 1.035", label: "48.3 / 1.035" },
  { value: "48.53 / 1.04", label: "48.53 / 1.04" },
  { value: "48.77 / 1.045", label: "48.77 / 1.045" },
  { value: "49 / 1.05", label: "49 / 1.05" },
  { value: "49.23 / 1.055", label: "49.23 / 1.055" },
  { value: "49.47 / 1.06", label: "49.47 / 1.06" },
  { value: "49.7 / 1.065", label: "49.7 / 1.065" },
  { value: "49.93 / 1.07", label: "49.93 / 1.07" },
];
const DRAW_FRAME_TD9_TOTAL_DRAFT_OPTIONS = [
  { value: "4", label: "4" },
  { value: "4.2", label: "4.2" },
  { value: "4.3", label: "4.3" },
  { value: "4.4", label: "4.4" },
  { value: "4.6", label: "4.6" },
  { value: "4.7", label: "4.7" },
  { value: "4.8", label: "4.8" },
  { value: "5", label: "5" },
  { value: "5.1", label: "5.1" },
  { value: "5.3", label: "5.3" },
  { value: "5.5", label: "5.5" },
  { value: "5.6", label: "5.6" },
  { value: "5.7", label: "5.7" },
  { value: "5.9", label: "5.9" },
  { value: "6.1", label: "6.1" },
  { value: "6.2", label: "6.2" },
  { value: "6.4", label: "6.4" },
  { value: "6.6", label: "6.6" },
  { value: "6.8", label: "6.8" },
  { value: "7", label: "7" },
  { value: "7.2", label: "7.2" },
  { value: "7.4", label: "7.4" },
  { value: "7.6", label: "7.6" },
  { value: "7.8", label: "7.8" },
  { value: "8", label: "8" },
  { value: "8.3", label: "8.3" },
  { value: "8.5", label: "8.5" },
  { value: "8.8", label: "8.8" },
  { value: "9", label: "9" },
  { value: "9.3", label: "9.3" },
  { value: "9.6", label: "9.6" },
  { value: "10", label: "10" },
];
const TD9_TOTAL_DRAFT_TO_G1_G2_MAP = {
  "4": "62.98 / 40",
  "4.2": "60.05 / 40",
  "4.3": "58.59 / 40",
  "4.4": "57.12 / 40",
  "4.6": "55.66 / 40",
  "4.7": "54.19 / 40",
  "4.8": "52.73 / 40",
  "5": "51.26 / 40",
  "5.1": "49.8 / 40",
  "5.3": "48.33 / 40",
  "5.5": "60.05 / 31",
  "5.6": "58.59 / 31",
  "5.7": "57.12 / 31",
  "5.9": "55.66 / 31",
  "6.1": "54.19 / 31",
  "6.2": "52.73 / 31",
  "6.4": "51.26 / 31",
  "6.6": "49.8 / 31",
  "6.8": "48.33 / 31",
  "7": "46.87 / 31",
  "7.2": "45.4 / 31",
  "7.4": "57.12 / 24",
  "7.6": "55.66 / 24",
  "7.8": "54.19 / 24",
  "8": "52.73 / 24",
  "8.3": "51.26 / 24",
  "8.5": "49.8 / 24",
  "8.8": "48.33 / 24",
  "9": "46.87 / 24",
  "9.3": "45.4 / 24",
  "9.6": "43.94 / 24",
  "10": "42.27 / 24",
};
const DRAW_FRAME_TD9_G1_G2_OPTIONS = [
  { value: "62.98 / 40", label: "62.98 / 40" },
  { value: "60.05 / 40", label: "60.05 / 40" },
  { value: "58.59 / 40", label: "58.59 / 40" },
  { value: "57.12 / 40", label: "57.12 / 40" },
  { value: "55.66 / 40", label: "55.66 / 40" },
  { value: "54.19 / 40", label: "54.19 / 40" },
  { value: "52.73 / 40", label: "52.73 / 40" },
  { value: "51.26 / 40", label: "51.26 / 40" },
  { value: "49.8 / 40", label: "49.8 / 40" },
  { value: "48.33 / 40", label: "48.33 / 40" },
  { value: "60.05 / 31", label: "60.05 / 31" },
  { value: "58.59 / 31", label: "58.59 / 31" },
  { value: "57.12 / 31", label: "57.12 / 31" },
  { value: "55.66 / 31", label: "55.66 / 31" },
  { value: "54.19 / 31", label: "54.19 / 31" },
  { value: "52.73 / 31", label: "52.73 / 31" },
  { value: "51.26 / 31", label: "51.26 / 31" },
  { value: "49.8 / 31", label: "49.8 / 31" },
  { value: "48.33 / 31", label: "48.33 / 31" },
  { value: "46.87 / 31", label: "46.87 / 31" },
  { value: "45.4 / 31", label: "45.4 / 31" },
  { value: "57.12 / 24", label: "57.12 / 24" },
  { value: "55.66 / 24", label: "55.66 / 24" },
  { value: "54.19 / 24", label: "54.19 / 24" },
  { value: "52.73 / 24", label: "52.73 / 24" },
  { value: "51.26 / 24", label: "51.26 / 24" },
  { value: "49.8 / 24", label: "49.8 / 24" },
  { value: "48.33 / 24", label: "48.33 / 24" },
  { value: "46.87 / 24", label: "46.87 / 24" },
  { value: "45.4 / 24", label: "45.4 / 24" },
  { value: "43.94 / 24", label: "43.94 / 24" },
  { value: "42.27 / 24", label: "42.27 / 24" },
];
const DRAW_FRAME_TD7_BDCP_OPTIONS = [
  { value: "1.038 / 26", label: "1.038 / 26" },
  { value: "1.080 / 25", label: "1.080 / 25" },
  { value: "1.125 / 24", label: "1.125 / 24" },
  { value: "1.174 / 23", label: "1.174 / 23" },
  { value: "1.227 / 22", label: "1.227 / 22" },
  { value: "1.286 / 21", label: "1.286 / 21" },
  { value: "1.350 / 20", label: "1.350 / 20" },
  { value: "1.421 / 19", label: "1.421 / 19" },
  { value: "1.500 / 18", label: "1.500 / 18" },
  { value: "1.588 / 17", label: "1.588 / 17" },
  { value: "1.688 / 16", label: "1.688 / 16" },
];
const DRAW_FRAME_TD9_BDCP_OPTIONS = [
  { value: "1.038 / 26", label: "1.038 / 26" },
  { value: "1.080 / 25", label: "1.080 / 25" },
  { value: "1.125 / 24", label: "1.125 / 24" },
  { value: "1.174 / 23", label: "1.174 / 23" },
  { value: "1.227 / 22", label: "1.227 / 22" },
  { value: "1.286 / 21", label: "1.286 / 21" },
  { value: "1.350 / 20", label: "1.350 / 20" },
  { value: "1.421 / 19", label: "1.421 / 19" },
  { value: "1.500 / 18", label: "1.500 / 18" },
  { value: "1.588 / 17", label: "1.588 / 17" },
  { value: "1.688 / 16", label: "1.688 / 16" },
];
const DRAW_FRAME_TD9_WEB_TENSION_OPTIONS = [
  { value: "87 / 0.99", label: "87 / 0.99" },
  { value: "86.5 / 0.995", label: "86.5 / 0.995" },
  { value: "86.1 / 1", label: "86.1 / 1" },
  { value: "85.7 / 1.005", label: "85.7 / 1.005" },
  { value: "85.2 / 1.011", label: "85.2 / 1.011" },
  { value: "84.8 / 1.015", label: "84.8 / 1.015" },
  { value: "84.4 / 1.02", label: "84.4 / 1.02" },
  { value: "84 / 1.025", label: "84 / 1.025" },
  { value: "83.6 / 1.03", label: "83.6 / 1.03" },
  { value: "83.2 / 1.035", label: "83.2 / 1.035" },
  { value: "82.8 / 1.04", label: "82.8 / 1.04" },
  { value: "82.4 / 1.045", label: "82.4 / 1.045" },
  { value: "82 / 1.05", label: "82 / 1.05" },
  { value: "81.6 / 1.055", label: "81.6 / 1.055" },
  { value: "81.2 / 1.06", label: "81.2 / 1.06" },
  { value: "80.8 / 1.066", label: "80.8 / 1.066" },
  { value: "80.5 / 1.07", label: "80.5 / 1.07" },
];
const DRAW_FRAME_TD7_BOTTOM_ROLLER_FRONT_OPTIONS = [
  { value: "37.8 / 1.5", label: "37.8 / 1.5" },
  { value: "38.4 / 2", label: "38.4 / 2" },
  { value: "38.9 / 2.5", label: "38.9 / 2.5" },
  { value: "39.4 / 3", label: "39.4 / 3" },
  { value: "39.9 / 3.5", label: "39.9 / 3.5" },
  { value: "40.4 / 4", label: "40.4 / 4" },
  { value: "40.9 / 4.5", label: "40.9 / 4.5" },
  { value: "41.4 / 5", label: "41.4 / 5" },
  { value: "42 / 5.5", label: "42 / 5.5" },
  { value: "42.5 / 6", label: "42.5 / 6" },
  { value: "43 / 6.5", label: "43 / 6.5" },
  { value: "43.5 / 7", label: "43.5 / 7" },
  { value: "44 / 7.5", label: "44 / 7.5" },
  { value: "44.5 / 8", label: "44.5 / 8" },
  { value: "45 / 8.5", label: "45 / 8.5" },
  { value: "45.5 / 9", label: "45.5 / 9" },
  { value: "46 / 9.5", label: "46 / 9.5" },
  { value: "46.6 / 10", label: "46.6 / 10" },
  { value: "47.1 / 10.5", label: "47.1 / 10.5" },
  { value: "47.6 / 11", label: "47.6 / 11" },
  { value: "48.1 / 11.5", label: "48.1 / 11.5" },
  { value: "48.6 / 12", label: "48.6 / 12" },
  { value: "49.1 / 12.5", label: "49.1 / 12.5" },
  { value: "49.6 / 13", label: "49.6 / 13" },
  { value: "50.1 / 13.5", label: "50.1 / 13.5" },
  { value: "50.6 / 14", label: "50.6 / 14" },
  { value: "51.1 / 14.5", label: "51.1 / 14.5" },
  { value: "51.6 / 15", label: "51.6 / 15" },
  { value: "52.2 / 15.5", label: "52.2 / 15.5" },
  { value: "52.7 / 16", label: "52.7 / 16" },
  { value: "53.2 / 16.5", label: "53.2 / 16.5" },
  { value: "53.7 / 17", label: "53.7 / 17" },
  { value: "54.2 / 17.5", label: "54.2 / 17.5" },
  { value: "54.7 / 18", label: "54.7 / 18" },
  { value: "55.2 / 18.5", label: "55.2 / 18.5" },
  { value: "55.7 / 19", label: "55.7 / 19" },
  { value: "56.2 / 19.5", label: "56.2 / 19.5" },
  { value: "56.7 / 20", label: "56.7 / 20" },
  { value: "57.2 / 20.5", label: "57.2 / 20.5" },
  { value: "57.7 / 21", label: "57.7 / 21" },
  { value: "58.2 / 21.5", label: "58.2 / 21.5" },
  { value: "58.8 / 22", label: "58.8 / 22" },
  { value: "59.3 / 22.5", label: "59.3 / 22.5" },
  { value: "59.8 / 23", label: "59.8 / 23" },
];
const DRAW_FRAME_TD9_BOTTOM_ROLLER_FRONT_OPTIONS = [
  { value: "37.8 / 1.5", label: "37.8 / 1.5" },
  { value: "38.4 / 2", label: "38.4 / 2" },
  { value: "38.9 / 2.5", label: "38.9 / 2.5" },
  { value: "39.4 / 3", label: "39.4 / 3" },
  { value: "39.9 / 3.5", label: "39.9 / 3.5" },
  { value: "40.4 / 4", label: "40.4 / 4" },
  { value: "40.9 / 4.5", label: "40.9 / 4.5" },
  { value: "41.4 / 5", label: "41.4 / 5" },
  { value: "42 / 5.5", label: "42 / 5.5" },
  { value: "42.5 / 6", label: "42.5 / 6" },
  { value: "43 / 6.5", label: "43 / 6.5" },
  { value: "43.5 / 7", label: "43.5 / 7" },
  { value: "44 / 7.5", label: "44 / 7.5" },
  { value: "44.5 / 8", label: "44.5 / 8" },
  { value: "45 / 8.5", label: "45 / 8.5" },
  { value: "45.5 / 9", label: "45.5 / 9" },
  { value: "46 / 9.5", label: "46 / 9.5" },
  { value: "46.6 / 10", label: "46.6 / 10" },
  { value: "47.1 / 10.5", label: "47.1 / 10.5" },
  { value: "47.6 / 11", label: "47.6 / 11" },
  { value: "48.1 / 11.5", label: "48.1 / 11.5" },
  { value: "48.6 / 12", label: "48.6 / 12" },
  { value: "49.1 / 12.5", label: "49.1 / 12.5" },
  { value: "49.6 / 13", label: "49.6 / 13" },
  { value: "50.1 / 13.5", label: "50.1 / 13.5" },
  { value: "50.6 / 14", label: "50.6 / 14" },
  { value: "51.1 / 14.5", label: "51.1 / 14.5" },
  { value: "51.6 / 15", label: "51.6 / 15" },
  { value: "52.2 / 15.5", label: "52.2 / 15.5" },
  { value: "52.7 / 16", label: "52.7 / 16" },
  { value: "53.2 / 16.5", label: "53.2 / 16.5" },
  { value: "53.7 / 17", label: "53.7 / 17" },
  { value: "54.2 / 17.5", label: "54.2 / 17.5" },
  { value: "54.7 / 18", label: "54.7 / 18" },
  { value: "55.2 / 18.5", label: "55.2 / 18.5" },
  { value: "55.7 / 19", label: "55.7 / 19" },
  { value: "56.2 / 19.5", label: "56.2 / 19.5" },
  { value: "56.7 / 20", label: "56.7 / 20" },
  { value: "57.2 / 20.5", label: "57.2 / 20.5" },
  { value: "57.7 / 21", label: "57.7 / 21" },
  { value: "58.2 / 21.5", label: "58.2 / 21.5" },
  { value: "58.8 / 22", label: "58.8 / 22" },
  { value: "59.3 / 22.5", label: "59.3 / 22.5" },
  { value: "59.8 / 23", label: "59.8 / 23" },
];
const DRAW_FRAME_TD7_BOTTOM_ROLLER_BACK_OPTIONS = [
  { value: "44.5 / 6.5", label: "44.5 / 6.5" },
  { value: "45 / 7", label: "45 / 7" },
  { value: "45.5 / 7.5", label: "45.5 / 7.5" },
  { value: "46 / 8", label: "46 / 8" },
  { value: "46.5 / 8.5", label: "46.5 / 8.5" },
  { value: "47 / 9", label: "47 / 9" },
  { value: "47.5 / 9.5", label: "47.5 / 9.5" },
  { value: "48 / 10", label: "48 / 10" },
  { value: "48.5 / 10.5", label: "48.5 / 10.5" },
  { value: "49 / 11", label: "49 / 11" },
  { value: "49.5 / 11.5", label: "49.5 / 11.5" },
  { value: "50 / 12", label: "50 / 12" },
  { value: "50.5 / 12.5", label: "50.5 / 12.5" },
  { value: "51 / 13", label: "51 / 13" },
  { value: "51.5 / 13.5", label: "51.5 / 13.5" },
  { value: "52 / 14", label: "52 / 14" },
  { value: "52.5 / 14.5", label: "52.5 / 14.5" },
  { value: "53 / 15", label: "53 / 15" },
  { value: "53.5 / 15.5", label: "53.5 / 15.5" },
  { value: "54 / 16", label: "54 / 16" },
  { value: "54.5 / 16.5", label: "54.5 / 16.5" },
  { value: "55 / 17", label: "55 / 17" },
  { value: "55.5 / 17.5", label: "55.5 / 17.5" },
  { value: "56 / 18", label: "56 / 18" },
  { value: "56.5 / 18.5", label: "56.5 / 18.5" },
  { value: "57 / 19", label: "57 / 19" },
  { value: "57.5 / 19.5", label: "57.5 / 19.5" },
  { value: "58 / 20", label: "58 / 20" },
  { value: "58.5 / 20.5", label: "58.5 / 20.5" },
  { value: "59 / 21", label: "59 / 21" },
  { value: "59.5 / 21.5", label: "59.5 / 21.5" },
  { value: "60 / 22", label: "60 / 22" },
  { value: "60.5 / 22.5", label: "60.5 / 22.5" },
  { value: "61 / 23", label: "61 / 23" },
];
const DRAW_FRAME_TD9_BOTTOM_ROLLER_BACK_OPTIONS = [
  { value: "44.5 / 6.5", label: "44.5 / 6.5" },
  { value: "45 / 7", label: "45 / 7" },
  { value: "45.5 / 7.5", label: "45.5 / 7.5" },
  { value: "46 / 8", label: "46 / 8" },
  { value: "46.5 / 8.5", label: "46.5 / 8.5" },
  { value: "47 / 9", label: "47 / 9" },
  { value: "47.5 / 9.5", label: "47.5 / 9.5" },
  { value: "48 / 10", label: "48 / 10" },
  { value: "48.5 / 10.5", label: "48.5 / 10.5" },
  { value: "49 / 11", label: "49 / 11" },
  { value: "49.5 / 11.5", label: "49.5 / 11.5" },
  { value: "50 / 12", label: "50 / 12" },
  { value: "50.5 / 12.5", label: "50.5 / 12.5" },
  { value: "51 / 13", label: "51 / 13" },
  { value: "51.5 / 13.5", label: "51.5 / 13.5" },
  { value: "52 / 14", label: "52 / 14" },
  { value: "52.5 / 14.5", label: "52.5 / 14.5" },
  { value: "53 / 15", label: "53 / 15" },
  { value: "53.5 / 15.5", label: "53.5 / 15.5" },
  { value: "54 / 16", label: "54 / 16" },
  { value: "54.5 / 16.5", label: "54.5 / 16.5" },
  { value: "55 / 17", label: "55 / 17" },
  { value: "55.5 / 17.5", label: "55.5 / 17.5" },
  { value: "56 / 18", label: "56 / 18" },
  { value: "56.5 / 18.5", label: "56.5 / 18.5" },
  { value: "57 / 19", label: "57 / 19" },
  { value: "57.5 / 19.5", label: "57.5 / 19.5" },
  { value: "58 / 20", label: "58 / 20" },
  { value: "58.5 / 20.5", label: "58.5 / 20.5" },
  { value: "59 / 21", label: "59 / 21" },
  { value: "59.5 / 21.5", label: "59.5 / 21.5" },
  { value: "60 / 22", label: "60 / 22" },
  { value: "60.5 / 22.5", label: "60.5 / 22.5" },
  { value: "61 / 23", label: "61 / 23" },
];
const DRAW_FRAME_BOTTOM_ROLLER_FRONT_OPTIONS = [
  "35 / 1.5",
  "36 / 2.5",
  "37 / 3.5",
  "38 / 4.5",
  "39 / 5.5",
  "40 / 6.5",
  "41 / 7.5",
  "42 / 8.5",
  "43 / 9.5",
  "44 / 10.5",
  "45 / 11.5",
  "46 / 12.5",
  "47 / 13.5",
  "48 / 14.5",
  "49 / 15.5",
  "50 / 16.5",
  "51 / 17.5",
  "52 / 18.5",
  "53 / 19.5",
  "54 / 20.5",
  "55 / 21.5",
  "56 / 22.5",
  "57 / 23.5",
  "58 / 24.5",
  "59 / 25.5",
  "60 / 26.5",
];
const DRAW_FRAME_BOTTOM_ROLLER_BACK_OPTIONS = [
  "40 / 10",
  "42 / 12",
  "44 / 14",
  "46 / 16",
  "48 / 18",
  "50 / 20",
  "52 / 22",
  "54 / 24",
  "56 / 26",
  "58 / 28",
  "60 / 30",
  "62 / 32",
  "64 / 34",
  "66 / 36",
  "68 / 38",
  "70 / 40",
  "72 / 42",
  "74 / 44",
  "76 / 46",
  "78 / 48",
  "80 / 50",
  "82 / 52",
  "84 / 54",
  "86 / 56",
  "88 / 58",
];
const DRAW_FRAME_SCANNING_ROLLER_OPTIONS = ["10", "20", "30", "40", "50", "60", "70", "80"];
const DRAW_FRAME_SCANNING_ROLLER_LOWER_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const DRAW_FRAME_SILVER_FUNNEL_OPTIONS = ["A", "B", "C", "D"];
const DRAW_FRAME_WEB_GUIDE_TUBE_OPTIONS = ["12", "14", "16", "18", "20"];
const DRAW_FRAME_INSERT_BORE_DIA_OPTIONS = ["0.20", "0.25", "0.30", "0.35", "0.40"];
const DRAW_FRAME_SELECT_OPTIONS = {
  md1: DRAW_FRAME_NW_OPTIONS,
  md2: DRAW_FRAME_NW_OPTIONS,
  bdcp: DRAW_FRAME_BREAK_DRAFT_OPTIONS,
  creelTension: DRAW_FRAME_W1VWZ_OPTIONS,
  feedTension: DRAW_FRAME_W8DR_OPTIONS,
  webTension: DRAW_FRAME_W3DR_OPTIONS,
  trumpet: DRAW_FRAME_BREAKER_TRUMPET_OPTIONS,
  bottomRollerFront: DRAW_FRAME_BOTTOM_ROLLER_FRONT_OPTIONS,
  bottomRollerBack: DRAW_FRAME_BOTTOM_ROLLER_BACK_OPTIONS,
  g1G2: ["G1/G2", "G1", "G2"],
  lrsbNw1: DRAW_FRAME_NW_OPTIONS,
  lrsbNw2: DRAW_FRAME_NW_OPTIONS,
  lrsbBackRollerPulley: DRAW_FRAME_W4_OPTIONS,
  lrsbMiddleRollerPulley: DRAW_FRAME_LRSB_VV_OPTIONS,
  lrsbCreelTensionDraft: DRAW_FRAME_LRSB_W1_OPTIONS,
  lrsbWebTensionDraft: DRAW_FRAME_LRSB_W3_OPTIONS,
  lrsbBottomRollerFront: DRAW_FRAME_LRSB_BOTTOM_ROLLER_FRONT_OPTIONS,
  lrsbBottomRollerBack: DRAW_FRAME_LRSB_BOTTOM_ROLLER_BACK_OPTIONS,
  lrsbScanningRoller: DRAW_FRAME_LRSB_SCANNING_ROLLER_OPTIONS,
  lrsbScanningRollerLower: DRAW_FRAME_LRSB_SCANNING_ROLLER_LOAD_OPTIONS,
  lrsbSilverFunnel: DRAW_FRAME_LRSB_SILVER_FUNNEL_OPTIONS,
  lrsbWebGuideTube: DRAW_FRAME_LRSB_WEB_GUIDE_TUBE_OPTIONS,
  lrsbSliverWireSize: DRAW_FRAME_LRSB_INSERT_BORE_DIA_OPTIONS,
  lrsbTrumpet: DRAW_FRAME_TRUMPET_OPTIONS,
  d40Nw1: DRAW_FRAME_NW_OPTIONS,
  d40Nw2: DRAW_FRAME_NW_OPTIONS,
  d40BreakDraft: DRAW_FRAME_BREAK_DRAFT_OPTIONS,
  d40CreelTensionDraft: DRAW_FRAME_W1VWZ_OPTIONS,
  d40WebTensionDraft: DRAW_FRAME_W3DR_OPTIONS,
  d40WebTensionPulley: DRAW_FRAME_W8DR_OPTIONS,
  d40BottomRollerFront: DRAW_FRAME_BOTTOM_ROLLER_FRONT_OPTIONS,
  d40BottomRollerBack: DRAW_FRAME_BOTTOM_ROLLER_BACK_OPTIONS,
  d40ScanningRoller: DRAW_FRAME_SCANNING_ROLLER_OPTIONS,
  d40Trumpet: DRAW_FRAME_TRUMPET_OPTIONS,
  d50BreakDraft: DRAW_FRAME_BREAK_DRAFT_OPTIONS,
  d50CreelTensionDraft: DRAW_FRAME_W1VWZ_OPTIONS,
  d50WebTensionDraft: DRAW_FRAME_W3DR_OPTIONS,
  d50FeedTensionDraft: DRAW_FRAME_W8DR_OPTIONS,
  d50BottomRollerFront: DRAW_FRAME_BOTTOM_ROLLER_FRONT_OPTIONS,
  d50BottomRollerBack: DRAW_FRAME_BOTTOM_ROLLER_BACK_OPTIONS,
  d50ScanningRoller: DRAW_FRAME_SCANNING_ROLLER_OPTIONS,
  d50Trumpet: DRAW_FRAME_TRUMPET_OPTIONS,
  ldf3sBreakDraft: DRAW_FRAME_LDF3S_BREAK_DRAFT_OPTIONS,
  ldf3sCreelTensionDraft: DRAW_FRAME_LDF3S_CREEL_TENSION_OPTIONS,
  ldf3sWebTensionDraft: DRAW_FRAME_LDF3S_WEB_TENSION_OPTIONS,
  ldf3sFeedTensionDraft: DRAW_FRAME_LDF3S_FEED_TENSION_OPTIONS,
  ldf3sBottomRollerFront: DRAW_FRAME_LDF3S_BOTTOM_ROLLER_FRONT_OPTIONS,
  ldf3sBottomRollerBack: DRAW_FRAME_LDF3S_BOTTOM_ROLLER_BACK_OPTIONS,
  ldf3sScanningRoller: DRAW_FRAME_LDF3S_SCANNING_ROLLER_OPTIONS,
  ldf3sTrumpet: DRAW_FRAME_LDF3S_TRUMPET_OPTIONS,
};

const getSelectOptions = (rowKey, wheelChangeType = "") => {
  if (TD7_LIKE_WHEEL_CHANGE_TYPES.includes(wheelChangeType)) {
    const isTd9 = wheelChangeType === "Type 3 (TD9)";
    switch (rowKey) {
      case "totalDraftGear":
        return isTd9 ? DRAW_FRAME_TD9_TOTAL_DRAFT_OPTIONS : DRAW_FRAME_TD7_TOTAL_DRAFT_OPTIONS;
      case "g1G2":
        return isTd9 ? DRAW_FRAME_TD9_G1_G2_OPTIONS : DRAW_FRAME_TD7_G1_G2_OPTIONS;
      case "bdcp":
        return isTd9 ? DRAW_FRAME_TD9_BDCP_OPTIONS : DRAW_FRAME_TD7_BDCP_OPTIONS;
      case "webTension":
        return isTd9 ? DRAW_FRAME_TD9_WEB_TENSION_OPTIONS : DRAW_FRAME_TD7_WEB_TENSION_OPTIONS;
      case "bottomRollerFront":
        return isTd9 ? DRAW_FRAME_TD9_BOTTOM_ROLLER_FRONT_OPTIONS : DRAW_FRAME_TD7_BOTTOM_ROLLER_FRONT_OPTIONS;
      case "bottomRollerBack":
        return isTd9 ? DRAW_FRAME_TD9_BOTTOM_ROLLER_BACK_OPTIONS : DRAW_FRAME_TD7_BOTTOM_ROLLER_BACK_OPTIONS;
      case "trumpet":
        return isTd9 ? DRAW_FRAME_TD9_TRUMPET_OPTIONS : DRAW_FRAME_TD7_TRUMPET_OPTIONS;
      default:
        return DRAW_FRAME_SELECT_OPTIONS[rowKey] || [];
    }
  }

  if (wheelChangeType === "Type 2 (D40)") {
    switch (rowKey) {
      case "d40Nw1":
      case "d40Nw2":
        return DRAW_FRAME_D40_NW_OPTIONS;
      case "d40BreakDraft":
        return DRAW_FRAME_D40_BREAK_DRAFT_OPTIONS;
      case "d40CreelTensionDraft":
        return DRAW_FRAME_D40_CREEL_TENSION_OPTIONS;
      case "d40WebTensionDraft":
        return DRAW_FRAME_D40_WEB_TENSION_OPTIONS;
      case "d40WebTensionPulley":
        return DRAW_FRAME_D40_FEED_TENSION_OPTIONS;
      case "d40BottomRollerFront":
        return DRAW_FRAME_D40_BOTTOM_ROLLER_FRONT_OPTIONS;
      case "d40BottomRollerBack":
        return DRAW_FRAME_D40_BOTTOM_ROLLER_BACK_OPTIONS;
      case "d40ScanningRoller":
        return DRAW_FRAME_D40_SCANNING_ROLLER_OPTIONS;
      case "d40Trumpet":
        return DRAW_FRAME_D40_TRUMPET_OPTIONS;
      default:
        return DRAW_FRAME_SELECT_OPTIONS[rowKey] || [];
    }
  }

  if (wheelChangeType === "Type 1 (LRSB)") {
    switch (rowKey) {
      case "lrsbNw1":
      case "lrsbNw2":
        return DRAW_FRAME_LRSB_NW_OPTIONS;
      case "lrsbBottomRollerBack":
        return DRAW_FRAME_LRSB_BOTTOM_ROLLER_BACK_OPTIONS;
      default:
        return DRAW_FRAME_SELECT_OPTIONS[rowKey] || [];
    }
  }

  if (wheelChangeType === "Type 3 (D50/D55)") {
    switch (rowKey) {
      case "d50BreakDraft":
        return DRAW_FRAME_D50_BREAK_DRAFT_OPTIONS;
      case "d50CreelTensionDraft":
        return DRAW_FRAME_D50_CREEL_TENSION_OPTIONS;
      case "d50WebTensionDraft":
        return DRAW_FRAME_D50_WEB_TENSION_OPTIONS;
      case "d50FeedTensionDraft":
        return DRAW_FRAME_D50_FEED_TENSION_OPTIONS;
      case "d50BottomRollerFront":
        return DRAW_FRAME_D50_BOTTOM_ROLLER_FRONT_OPTIONS;
      case "d50BottomRollerBack":
        return DRAW_FRAME_D50_BOTTOM_ROLLER_BACK_OPTIONS;
      case "d50ScanningRoller":
        return DRAW_FRAME_D50_SCANNING_ROLLER_OPTIONS;
      case "d50Trumpet":
        return DRAW_FRAME_D50_TRUMPET_OPTIONS;
      default:
        return DRAW_FRAME_SELECT_OPTIONS[rowKey] || [];
    }
  }

  return DRAW_FRAME_SELECT_OPTIONS[rowKey] || [];
};
const normalizeApiWheelChangeType = (value) => {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (text === "type1") return "Type 1 (SB20)";
  if (text === "type2") return "Type 2 (TD7)";
  if (text === "type3") return "Type 3 (TD9)";
  if (text === "finisher_type1_lrsb" || text === "finishertype1(lrsb)" || text === "finishertype1lrsb") {
    return "Type 1 (LRSB)";
  }
  if (text === "type2_d40" || text === "type2(d40)" || text === "type2d40") return "Type 2 (D40)";
  if (text === "type3_d50_d55" || text === "type3(d50/d55)" || text === "type3d50d55") return "Type 3 (D50/D55)";
  if (text === "type4_ldf3s" || text === "type4(ldf3s)" || text === "type4ldf3s") return "Type 4 (LDF3S)";
  return "";
};

const normalizeParameters = (parameters) => {
  if (!parameters) return {};
  if (Array.isArray(parameters)) {
    return parameters.reduce((acc, item) => {
      if (!item || typeof item !== "object") return acc;
      if (item.key) {
        acc[item.key] = item;
        return acc;
      }
      Object.assign(acc, normalizeParameters(item));
      return acc;
    }, {});
  }
  const source = parameters;
  if (!source || typeof source !== "object") return {};
  if (source.rows && typeof source.rows === "object" && !Array.isArray(source.rows)) {
    return source.rows;
  }
  return source;
};

const buildValuesFromParameters = (parameters) => {
  const nextValues = createValues();
  const rows = normalizeParameters(parameters);

  Object.entries(rows).forEach(([key, rowValue]) => {
    if (!nextValues[key]) return;
    if (rowValue && typeof rowValue === "object" && !Array.isArray(rowValue)) {
      nextValues[key] = {
        existing: String(rowValue.proposed ?? rowValue.existing ?? ""),
        proposed: "",
      };
      return;
    }
    nextValues[key] = {
      existing: String(rowValue ?? ""),
      proposed: "",
    };
  });

  return nextValues;
};

const getApiWheelChangeType = (wheelChangeType = "") =>
  WHEEL_CHANGE_API_TYPES[wheelChangeType] || wheelChangeType;

// Overlays only the Proposed column from a still-unapproved (pending or
// rejected) entry onto an already-built Existing baseline. The Existing
// baseline always comes from the last *approved* entry only.
const applyUnapprovedProposedValues = (existingValues, entry) => {
  const rows = normalizeParameters(pickSavedRows(entry));
  const nextValues = { ...existingValues };
  Object.entries(rows).forEach(([key, rowValue]) => {
    if (!nextValues[key]) return;
    const proposedValue =
      rowValue && typeof rowValue === "object" && !Array.isArray(rowValue)
        ? String(rowValue.proposed ?? "")
        : "";
    nextValues[key] = {
      existing: nextValues[key]?.existing || "",
      proposed: proposedValue,
    };
  });
  return nextValues;
};

const getLineTypeForWheelChangeType = (wheelChangeType = "") =>
  Object.entries(WHEEL_CHANGE_TYPES_BY_LINE).find(([, types]) => types.includes(wheelChangeType))?.[0] || "";

const pickSavedRows = (entry) => {
  if (Array.isArray(entry?.parameters) && entry.parameters.length) return entry.parameters;
  if (entry?.parameters && !Array.isArray(entry.parameters)) return entry.parameters;
  if (entry?.rows) return entry.rows;
  return [];
};

const extractLatestEntry = (payload) => {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];
  return rows[0] || null;
};

const toInputDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().split("T")[0];
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

const DrawFrameWheelChange = forwardRef(function DrawFrameWheelChange(
  {
    selectedTypeName = "Wheel Change",
    typeOptions = [],
    entryId = "#DWC-001",
    onTypeChange,
    onWheelChangeTypeChange,
  },
  ref
) {
  const user = useSelector((state) => state.auth?.user);
  const operatorName = String(
    user?.name || user?.full_name || user?.user_name || user?.username || ""
  ).trim();
  const [wheelChangeType, setWheelChangeType] = useState("");
  const [lineType, setLineType] = useState("");
  const [machineNo, setMachineNo] = useState("");
  const [machineOptions, setMachineOptions] = useState([]);
  const [date, setDate] = useState(getTodayDate);
  const [values, setValues] = useState(createValues);
  const [errors, setErrors] = useState({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [mixingOptions, setMixingOptions] = useState([]);
  const [loadingVarietyOptions, setLoadingVarietyOptions] = useState(false);
  const [varietyOptionsError, setVarietyOptionsError] = useState("");
  // The most recent *unapproved* submission for this sub-type + machine, if
  // any — either still awaiting L2 review or previously rejected. It's the
  // row still sitting in the pending table, so its Proposed values are shown
  // (and will be silently overwritten on the next submit).
  const [unapprovedEntry, setUnapprovedEntry] = useState(null);
  const lastLoadedMixingRef = useRef("");

  // Type 1-4 (SB20/TD7/TD9/LRSB/D40/D50-D55/LDF3S) each post to their own
  // backend table; report the current selection up so the parent can reserve
  // the Entry ID from that same table instead of a generic/shared one.
  useEffect(() => {
    onWheelChangeTypeChange?.(wheelChangeType);
  }, [onWheelChangeTypeChange, wheelChangeType]);

  const activeRows = useMemo(
    () => (wheelChangeType ? ROWS_BY_TYPE[wheelChangeType] || [] : []),
    [wheelChangeType]
  );
  const selectedMixingRow = activeRows.find(
    (row) => row.key.toLowerCase().includes("mixing") || row.label.toLowerCase().includes("mixing")
  );
  const selectedMixingExisting = String(values[selectedMixingRow?.key]?.existing || "").trim();
  const availableWheelChangeTypes = useMemo(
    () => WHEEL_CHANGE_TYPES_BY_LINE[lineType] || [],
    [lineType]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(DRAFT_STORAGE_KEY_LEGACY);
    try {
      const stored = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || "{}");
      if (stored && typeof stored === "object") {
        setWheelChangeType(typeof stored.wheelChangeType === "string" ? stored.wheelChangeType : "");
        setLineType(typeof stored.lineType === "string" ? stored.lineType : "");
        setMachineNo(typeof stored.machineNo === "string" ? stored.machineNo : "");
        setDate(typeof stored.date === "string" && stored.date ? stored.date : getTodayDate());
        setValues({
          ...createValues(),
          ...(stored.values && typeof stored.values === "object" ? stored.values : {}),
        });
      }
    } catch {
      // Ignore invalid saved drafts.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadDropdowns = async () => {
      setLoadingVarietyOptions(true);
      try {
        const dropdown = await fetchDrawFrameUqcMasterDropdown();
        if (!active) return;
        setMixingOptions(Array.isArray(dropdown?.varietyNames) ? dropdown.varietyNames : []);
        setVarietyOptionsError("");
      } catch (error) {
        if (!active) return;
        setMixingOptions([]);
        setVarietyOptionsError(error.message || "Unable to load draw frame mixing options.");
      } finally {
        if (active) setLoadingVarietyOptions(false);
      }
    };

    loadDropdowns();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadMachines = async () => {
      try {
        const machines = await fetchDrawFrameMachineMaster();
        if (!active) return;
        const names = Array.from(
          new Set(
            machines
              .map((item) => String(item?.mc_name || item?.machine_number || item?.machine_no || "").trim())
              .filter(Boolean)
          )
        );
        setMachineOptions(names);
      } catch {
        if (active) setMachineOptions([]);
      }
    };

    loadMachines();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        wheelChangeType,
        lineType,
        machineNo,
        date,
        values,
      })
    );
  }, [date, draftLoaded, lineType, machineNo, values, wheelChangeType]);

  const loadLatestSaved = async (requestedWheelChangeType = wheelChangeType, mixingValue = "") => {
    const apiWheelChangeType = getApiWheelChangeType(requestedWheelChangeType);
    const baseParams = { page: 1, limit: 1, wheelChangeType: apiWheelChangeType };
    const trimmedMixing = String(mixingValue || "").trim();
    if (trimmedMixing) {
      // Fetch/pre-populate is keyed by Mixing/Process, matching Spinning and
      // Carding. machine_no is still sent on submit below since the backend
      // uses it as its own carry-forward/supersede key, but the frontend's
      // "what was last approved" lookup goes by mixing here.
      baseParams.variety = trimmedMixing;
      baseParams.variety_name = trimmedMixing;
      baseParams.mixing = trimmedMixing;
    }

    const [approvedResult, pendingResult, rejectedResult] = await Promise.allSettled([
      fetchDrawFrameWheelChangeEntries({ ...baseParams, approval_status: "approved", status: "approved" }),
      fetchDrawFrameWheelChangeEntries({ ...baseParams, approval_status: "pending", status: "pending" }),
      fetchDrawFrameWheelChangeEntries({ ...baseParams, approval_status: "rejected", status: "rejected" }),
    ]);

    const approved = approvedResult.status === "fulfilled" ? extractLatestEntry(approvedResult.value) : null;
    const pending = pendingResult.status === "fulfilled" ? extractLatestEntry(pendingResult.value) : null;
    const rejected = rejectedResult.status === "fulfilled" ? extractLatestEntry(rejectedResult.value) : null;
    const unapproved = pending || rejected;
    if (!approved && !unapproved) return null;

    const referenceEntry = approved || unapproved;
    const savedWheelChangeType =
      WHEEL_CHANGE_TYPES.includes(referenceEntry.wheel_change_type_label)
        ? referenceEntry.wheel_change_type_label
        : normalizeApiWheelChangeType(referenceEntry.wheel_change_type);
    const savedLineType =
      String(referenceEntry.line_type || "") ||
      getLineTypeForWheelChangeType(savedWheelChangeType || requestedWheelChangeType);

    setWheelChangeType(savedWheelChangeType || requestedWheelChangeType);
    setLineType(savedLineType);
    setDate(
      toInputDate(referenceEntry.entry_date || referenceEntry.date || referenceEntry.created_at) || getTodayDate()
    );
    setUnapprovedEntry(
      unapproved
        ? {
            status: pending ? "pending" : "rejected",
            remarks: String(unapproved?.review_remarks ?? unapproved?.reviewRemarks ?? "").trim(),
            reviewedBy: String(unapproved?.reviewed_by ?? unapproved?.reviewedBy ?? "").trim(),
            reviewedAt: unapproved?.reviewed_at ?? unapproved?.reviewedAt ?? "",
          }
        : null
    );
    setValues(() => {
      const baseline = buildValuesFromParameters(pickSavedRows(approved || {}));
      return unapproved ? applyUnapprovedProposedValues(baseline, unapproved) : baseline;
    });
    setErrors({});
    return referenceEntry;
  };

  useEffect(() => {
    if (!draftLoaded || !wheelChangeType || !selectedMixingExisting) {
      lastLoadedMixingRef.current = "";
      setUnapprovedEntry(null);
      return;
    }

    const selectionKey = `${wheelChangeType}::${selectedMixingExisting}`;
    if (lastLoadedMixingRef.current === selectionKey) return;

    let cancelled = false;
    loadLatestSaved(wheelChangeType, selectedMixingExisting)
      .then((latest) => {
        if (cancelled || !latest) return;
        lastLoadedMixingRef.current = selectionKey;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [draftLoaded, selectedMixingExisting, wheelChangeType]);

  useEffect(() => {
    if (wheelChangeType !== "Type 1 (SB20)") return;

    const expectedDraftConstant = "3.993";
    const nextValues = {
      ...values,
      draftConstant: { existing: expectedDraftConstant, proposed: expectedDraftConstant },
      totalDraft: {
        existing: computeType1Sb20TotalDraft({
          nw1: values.md1?.existing,
          nw2: values.md2?.existing,
        }),
        proposed: computeType1Sb20TotalDraft({
          nw1: values.md1?.proposed,
          nw2: values.md2?.proposed,
        }),
      },
    };

    if (
      values.draftConstant?.existing !== nextValues.draftConstant.existing ||
      values.draftConstant?.proposed !== nextValues.draftConstant.proposed ||
      values.totalDraft?.existing !== nextValues.totalDraft.existing ||
      values.totalDraft?.proposed !== nextValues.totalDraft.proposed
    ) {
      setValues(nextValues);
    }
  }, [wheelChangeType, values.md1?.existing, values.md1?.proposed, values.md2?.existing, values.md2?.proposed, values.draftConstant?.existing, values.draftConstant?.proposed, values.totalDraft?.existing, values.totalDraft?.proposed]);

  useEffect(() => {
    if (wheelChangeType !== "Type 1 (LRSB)") return;

    setValues((current) => {
      const nextValues = {
        ...current,
        lrsbTotalDraftConstant: {
          existing: current.lrsbTotalDraftConstant?.existing || "6.01",
          proposed: current.lrsbTotalDraftConstant?.proposed || "6.01",
        },
        lrsbTotalDraft: {
          existing: computeFinisherType1LrsbTotalDraft({
            nw1: current.lrsbNw1?.existing,
            nw2: current.lrsbNw2?.existing,
            totalDraftConstant: current.lrsbTotalDraftConstant?.existing || "6.01",
          }),
          proposed: computeFinisherType1LrsbTotalDraft({
            nw1: current.lrsbNw1?.proposed,
            nw2: current.lrsbNw2?.proposed,
            totalDraftConstant: current.lrsbTotalDraftConstant?.proposed || "6.01",
          }),
        },
        lrsbBreakDraft: {
          existing: computeFinisherType1LrsbBreakDraft({
            backRollerPulley: current.lrsbBackRollerPulley?.existing,
            middleRollerPulley: current.lrsbMiddleRollerPulley?.existing,
          }),
          proposed: computeFinisherType1LrsbBreakDraft({
            backRollerPulley: current.lrsbBackRollerPulley?.proposed,
            middleRollerPulley: current.lrsbMiddleRollerPulley?.proposed,
          }),
        },
      };

      if (
        current.lrsbTotalDraftConstant?.existing === nextValues.lrsbTotalDraftConstant.existing &&
        current.lrsbTotalDraftConstant?.proposed === nextValues.lrsbTotalDraftConstant.proposed &&
        current.lrsbTotalDraft?.existing === nextValues.lrsbTotalDraft.existing &&
        current.lrsbTotalDraft?.proposed === nextValues.lrsbTotalDraft.proposed &&
        current.lrsbBreakDraft?.existing === nextValues.lrsbBreakDraft.existing &&
        current.lrsbBreakDraft?.proposed === nextValues.lrsbBreakDraft.proposed
      ) {
        return current;
      }

      return nextValues;
    });
  }, [
    wheelChangeType,
    values.lrsbNw1?.existing,
    values.lrsbNw1?.proposed,
    values.lrsbNw2?.existing,
    values.lrsbNw2?.proposed,
    values.lrsbTotalDraftConstant?.existing,
    values.lrsbTotalDraftConstant?.proposed,
    values.lrsbScanningRoller?.existing,
    values.lrsbScanningRoller?.proposed,
    values.lrsbScanningRollerLower?.existing,
    values.lrsbScanningRollerLower?.proposed,
  ]);

  useEffect(() => {
    if (wheelChangeType === "Type 2 (D40)") {
      setValues((current) => {
        const hasExistingConstant = current.d40TotalDraftConstant?.existing || current.d40TotalDraftConstant?.proposed;
        const nextValues = {
          ...current,
          d40TotalDraftConstant: {
            existing: current.d40TotalDraftConstant?.existing || "5.98",
            proposed: current.d40TotalDraftConstant?.proposed || "5.98",
          },
          d40TotalDraft: {
            existing: computeType2D40TotalDraft({
              nw1: current.d40Nw1?.existing,
              nw2: current.d40Nw2?.existing,
              totalDraftConstant: current.d40TotalDraftConstant?.existing || "5.98",
            }),
            proposed: computeType2D40TotalDraft({
              nw1: current.d40Nw1?.proposed,
              nw2: current.d40Nw2?.proposed,
              totalDraftConstant: current.d40TotalDraftConstant?.proposed || "5.98",
            }),
          },
        };

        if (!hasExistingConstant && (current.d40TotalDraft?.existing || current.d40TotalDraft?.proposed)) {
          return nextValues;
        }

        if (
          current.d40TotalDraft?.existing !== nextValues.d40TotalDraft.existing ||
          current.d40TotalDraft?.proposed !== nextValues.d40TotalDraft.proposed ||
          current.d40TotalDraftConstant?.existing !== nextValues.d40TotalDraftConstant.existing ||
          current.d40TotalDraftConstant?.proposed !== nextValues.d40TotalDraftConstant.proposed
        ) {
          return nextValues;
        }

        return current;
      });
    }
  }, [wheelChangeType, values.d40Nw1?.existing, values.d40Nw1?.proposed, values.d40Nw2?.existing, values.d40Nw2?.proposed, values.d40TotalDraftConstant?.existing, values.d40TotalDraftConstant?.proposed]);

  useEffect(() => {
    if (wheelChangeType !== "Type 3 (D50/D55)") return;

    setValues((current) => {
      const nextValues = {
        ...current,
        d50TotalDraft: {
          existing: computeType3D50TotalDraft({
            delHank: current.d50DelHank?.existing,
            feedHank: current.d50FeedHank?.existing,
            noOfEnds: current.d50NoOfEnds?.existing,
          }),
          proposed: computeType3D50TotalDraft({
            delHank: current.d50DelHank?.proposed,
            feedHank: current.d50FeedHank?.proposed,
            noOfEnds: current.d50NoOfEnds?.proposed,
          }),
        },
      };

      if (
        current.d50TotalDraft?.existing === nextValues.d50TotalDraft.existing &&
        current.d50TotalDraft?.proposed === nextValues.d50TotalDraft.proposed
      ) {
        return current;
      }

      return nextValues;
    });
  }, [wheelChangeType, values.d50DelHank?.existing, values.d50DelHank?.proposed, values.d50FeedHank?.existing, values.d50FeedHank?.proposed, values.d50NoOfEnds?.existing, values.d50NoOfEnds?.proposed]);

  useEffect(() => {
    if (wheelChangeType !== "Type 4 (LDF3S)") return;

    setValues((current) => {
      const nextValues = {
        ...current,
        ldf3sTotalDraft: {
          existing: computeType4Ldf3sTotalDraft({
            deliveryHank: current.ldf3sDelHank?.existing,
            feedHank: current.ldf3sFeedHank?.existing,
            noOfEnds: current.ldf3sNoOfEnds?.existing,
          }),
          proposed: computeType4Ldf3sTotalDraft({
            deliveryHank: current.ldf3sDelHank?.proposed,
            feedHank: current.ldf3sFeedHank?.proposed,
            noOfEnds: current.ldf3sNoOfEnds?.proposed,
          }),
        },
      };

      if (
        current.ldf3sTotalDraft?.existing === nextValues.ldf3sTotalDraft.existing &&
        current.ldf3sTotalDraft?.proposed === nextValues.ldf3sTotalDraft.proposed
      ) {
        return current;
      }

      return nextValues;
    });
  }, [wheelChangeType, values.ldf3sDelHank?.existing, values.ldf3sDelHank?.proposed, values.ldf3sFeedHank?.existing, values.ldf3sFeedHank?.proposed, values.ldf3sNoOfEnds?.existing, values.ldf3sNoOfEnds?.proposed]);

  useEffect(() => {
    if (!TD7_LIKE_WHEEL_CHANGE_TYPES.includes(wheelChangeType)) return;

    setValues((current) => {
      const nextValues = {
        ...current,
        totalDraftFormula: {
          existing: computeType4Ldf3sTotalDraft({
            deliveryHank: current.delHank?.existing,
            feedHank: current.feedHank?.existing,
            noOfEnds: current.noOfEnds?.existing,
          }),
          proposed: computeType4Ldf3sTotalDraft({
            deliveryHank: current.delHank?.proposed,
            feedHank: current.feedHank?.proposed,
            noOfEnds: current.noOfEnds?.proposed,
          }),
        },
      };

      if (
        current.totalDraftFormula?.existing === nextValues.totalDraftFormula.existing &&
        current.totalDraftFormula?.proposed === nextValues.totalDraftFormula.proposed
      ) {
        return current;
      }

      return nextValues;
    });
  }, [wheelChangeType, values.delHank?.existing, values.delHank?.proposed, values.feedHank?.existing, values.feedHank?.proposed, values.noOfEnds?.existing, values.noOfEnds?.proposed]);

  useEffect(() => {
    if (!TD7_LIKE_WHEEL_CHANGE_TYPES.includes(wheelChangeType)) return;

    const draftValue = values.totalDraftGear?.existing || values.totalDraftGear?.proposed || "";
    const autoG1G2 = getTd7G1G2ForTotalDraft(draftValue, wheelChangeType);
    if (!autoG1G2) return;
    if ((values.g1G2?.existing || values.g1G2?.proposed || "") === autoG1G2) return;

    setValues((current) => applyType2Td7AutoFill({ ...current }, "totalDraftGear", wheelChangeType));
  }, [wheelChangeType, values.g1G2?.existing, values.g1G2?.proposed, values.totalDraftGear?.existing, values.totalDraftGear?.proposed]);

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

  const applyType1Sb20ComputedValues = (nextValues) => {
    if (wheelChangeType !== "Type 1 (SB20)") return nextValues;

    return {
      ...nextValues,
      draftConstant: { existing: "3.993", proposed: "3.993" },
      totalDraft: {
        existing: computeType1Sb20TotalDraft({
          nw1: nextValues.md1?.existing,
          nw2: nextValues.md2?.existing,
        }),
        proposed: computeType1Sb20TotalDraft({
          nw1: nextValues.md1?.proposed,
          nw2: nextValues.md2?.proposed,
        }),
      },
    };
  };

  const applyFinisherType1LrsbComputedValues = (nextValues) => {
    if (wheelChangeType !== "Type 1 (LRSB)") return nextValues;

    return {
      ...nextValues,
      lrsbTotalDraftConstant: {
        existing: nextValues.lrsbTotalDraftConstant?.existing || "6.01",
        proposed: nextValues.lrsbTotalDraftConstant?.proposed || "6.01",
      },
      lrsbTotalDraft: {
        existing: computeFinisherType1LrsbTotalDraft({
          nw1: nextValues.lrsbNw1?.existing,
          nw2: nextValues.lrsbNw2?.existing,
          totalDraftConstant: nextValues.lrsbTotalDraftConstant?.existing || "6.01",
        }),
        proposed: computeFinisherType1LrsbTotalDraft({
          nw1: nextValues.lrsbNw1?.proposed,
          nw2: nextValues.lrsbNw2?.proposed,
          totalDraftConstant: nextValues.lrsbTotalDraftConstant?.proposed || "6.01",
        }),
      },
      lrsbBreakDraft: {
        existing: computeFinisherType1LrsbBreakDraft({
          backRollerPulley: nextValues.lrsbBackRollerPulley?.existing,
          middleRollerPulley: nextValues.lrsbMiddleRollerPulley?.existing,
        }),
        proposed: computeFinisherType1LrsbBreakDraft({
          backRollerPulley: nextValues.lrsbBackRollerPulley?.proposed,
          middleRollerPulley: nextValues.lrsbMiddleRollerPulley?.proposed,
        }),
      },
    };
  };

  const handleValueChange = (rowKey, column) => (eventOrValue) => {
    const nextValue =
      typeof eventOrValue === "object" && eventOrValue !== null && "target" in eventOrValue
        ? eventOrValue.target.value
        : eventOrValue;
    setValues((current) => {
      const updatedValues = applyFinisherType1LrsbComputedValues(applyType1Sb20ComputedValues({
        ...current,
        [rowKey]: {
          ...(current[rowKey] || { existing: "", proposed: "" }),
          [column]: nextValue,
        },
      }));
      return applyType2Td7AutoFill(updatedValues, rowKey, wheelChangeType);
    });
    clearValueError(rowKey, column);
  };

  const handleNumericValueChange = (rowKey, column) => (event) => {
    const nextValue = sanitizeNumericInput(event.target.value, { precision: 10, scale: 3 });
    setValues((current) => {
      const updatedValues = applyFinisherType1LrsbComputedValues(applyType1Sb20ComputedValues({
        ...current,
        [rowKey]: {
          ...(current[rowKey] || { existing: "", proposed: "" }),
          [column]: nextValue,
        },
      }));
      return applyType2Td7AutoFill(updatedValues, rowKey, wheelChangeType);
    });
    clearValueError(rowKey, column);
  };

  const clear = () => {
    setWheelChangeType("");
    setLineType("");
    setMachineNo("");
    setDate(getTodayDate());
    setValues(createValues());
    setErrors({});
    setUnapprovedEntry(null);
    lastLoadedMixingRef.current = "";
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!selectedTypeName) nextErrors.selectedTypeName = true;
    if (!lineType.trim()) nextErrors.lineType = true;
    if (!wheelChangeType.trim()) nextErrors.wheelChangeType = true;
    if (!machineNo.trim()) nextErrors.machineNo = true;
    if (!date) nextErrors.date = true;

    const valueErrors = {};
    activeRows.forEach((row) => {
      const rowValues = values[row.key] || {};
      const rowErrors = {};
      const isSelectField = row.inputType === "select";
      const isMixingField =
        isSelectField && (row.key.toLowerCase().includes("mixing") || row.label.toLowerCase().includes("mixing"));
      const isBlendPercent = row.key.toLowerCase().includes("blendpercent");
      const isValidExisting = isMixingField
        ? hasTextValue(rowValues.existing)
        : isSelectField
          ? hasTextValue(rowValues.existing)
          : isBlendPercent
            ? isBlendPercentValue(rowValues.existing)
            : parseNumericValue(rowValues.existing) !== null;
      const isValidProposed = isMixingField
        ? hasTextValue(rowValues.proposed)
        : isSelectField
          ? hasTextValue(rowValues.proposed)
          : isBlendPercent
            ? isBlendPercentValue(rowValues.proposed)
            : parseNumericValue(rowValues.proposed) !== null;

      if (hasTextValue(rowValues.existing) && !isValidExisting) {
        rowErrors.existing = true;
      }
      if (hasTextValue(rowValues.proposed) && !isValidProposed) {
        rowErrors.proposed = true;
      }
      if (Object.keys(rowErrors).length > 0) valueErrors[row.key] = rowErrors;
    });

    if (Object.keys(valueErrors).length > 0) nextErrors.values = valueErrors;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getPayload = () => {
    const payload = {
      entry_id: entryId,
      type: selectedTypeName,
      department: "Draw Frame",
      approval_status: "pending",
      operator: operatorName,
      line_type: lineType,
      machine_no: machineNo,
      wheel_change_type: getApiWheelChangeType(wheelChangeType),
      wheel_change_type_label: wheelChangeType,
      entry_date: date || getTodayDate(),
      date: date || getTodayDate(),
      parameters: [],
      rows: {},
    };

    activeRows.forEach((row) => {
      const parameter = {
        key: row.key,
        label: row.label,
        existing: getTextValue(values[row.key]?.existing),
        proposed: getTextValue(values[row.key]?.proposed),
      };
      payload.rows[row.key] = parameter;
      payload.parameters.push(parameter);
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
                ? "This mixing has a rejected entry still pending resubmission. Submitting will replace it — there is no undo."
                : "This mixing already has an entry awaiting L2 verification. Submitting will overwrite it — there is no undo.",
            wide: true,
          },
        ]
      : []),
    { label: "Checking Type", value: selectedTypeName || "-" },
    { label: "Line Type", value: lineType || "-" },
    { label: "Machine No.", value: machineNo || "-" },
    { label: "Wheel Change Type", value: wheelChangeType || "-" },
    { label: "Entry ID", value: entryId || "#DWC-001" },
    { label: "Date", value: date || "-" },
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
    loadLatestSaved,
  }));

  const renderControl = (row, column) => {
    const value = values[row.key]?.[column] || "";
    const className = `${styles.input} ${row.darkInput ? styles.darkInput : ""} ${
      errors.values?.[row.key]?.[column] ? styles.errorInput : ""
    }`;
    const isMixingRow = row.inputType === "select" && (row.key.toLowerCase().includes("mixing") || row.label.toLowerCase().includes("mixing"));

    if (isMixingRow) {
      return (
        <SearchableSelect
          className={className}
          value={value}
          onChange={(nextValue) => {
            setValues((current) => {
              const updatedValues = applyFinisherType1LrsbComputedValues(applyType1Sb20ComputedValues({
                ...current,
                [row.key]: {
                  ...(current[row.key] || { existing: "", proposed: "" }),
                  [column]: nextValue,
                },
              }));
              return applyType2Td7AutoFill(updatedValues, row.key, wheelChangeType);
            });
            clearValueError(row.key, column);
          }}
          options={mixingOptions}
          placeholder={loadingVarietyOptions ? "Loading..." : varietyOptionsError ? "Select Mixing" : "Select"}
          ariaLabel="Mixing"
          disabled={loadingVarietyOptions && !mixingOptions.length}
        />
      );
    }

    if (row.inputType === "select") {
      const options = getSelectOptions(row.key, wheelChangeType);
      return (
        <select className={className} value={value} onChange={handleValueChange(row.key, column)}>
          <option value="">Select</option>
          {options.map((option) => {
            const optionValue = typeof option === "string" ? option : option.value;
            const optionLabel = typeof option === "string" ? option : option.label ?? option.value;
            return (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
      );
    }

    if (row.key.toLowerCase().includes("blendpercent")) {
      return (
        <input
          type="text"
          inputMode="text"
          className={className}
          value={value}
          onChange={(event) => {
            const nextValue = sanitizeBlendPercentInput(event.target.value);
            setValues((current) => {
              const updatedValues = applyFinisherType1LrsbComputedValues(applyType1Sb20ComputedValues({
                ...current,
                [row.key]: {
                  ...(current[row.key] || { existing: "", proposed: "" }),
                  [column]: nextValue,
                },
              }));
              return applyType2Td7AutoFill(updatedValues, row.key, wheelChangeType);
            });
            clearValueError(row.key, column);
          }}
        />
      );
    }

    return (
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className={className}
        value={value}
        onChange={handleNumericValueChange(row.key, column)}
        readOnly={row.darkInput}
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
        {unapprovedEntry?.status === "pending" && (
          <div className={styles.pendingNotice}>
            A proposed entry for this mixing is still awaiting L2 approval. The Proposed column below shows that
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
            <label>Line Type</label>
            <select
              className={`${styles.topInput} ${errors.lineType ? styles.errorInput : ""}`}
              value={lineType}
              onChange={(event) => {
                const nextLineType = event.target.value;
                setLineType(nextLineType);
                if (!WHEEL_CHANGE_TYPES_BY_LINE[nextLineType]?.includes(wheelChangeType)) {
                  setWheelChangeType("");
                }
                clearFieldError("lineType");
              }}
            >
              <option value="">Select line type</option>
              {LINE_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label>Wheel Change Type</label>
            <select
              className={`${styles.topInput} ${errors.wheelChangeType ? styles.errorInput : ""}`}
              value={wheelChangeType}
              disabled={!lineType}
              onChange={(event) => {
                const nextWheelChangeType = event.target.value;
                if (nextWheelChangeType !== wheelChangeType) {
                  setValues(createValues());
                  setErrors({});
                }
                setWheelChangeType(nextWheelChangeType);
                clearFieldError("wheelChangeType");
              }}
            >
              <option value="">{lineType ? "Select wheel change type" : "Select line type first"}</option>
              {availableWheelChangeTypes.map((item) => (
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
            <input type="text" className={styles.topInput} value={entryId || "#DWC-001"} readOnly disabled />
          </div>

          <div className={styles.field}>
            <label>Date</label>
            <input
              type="date"
              className={`${styles.topInput} ${errors.date ? styles.errorInput : ""}`}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                clearFieldError("date");
              }}
            />
          </div>

          <div className={styles.field}>
            <label>Machine No.</label>
            <SearchableSelect
              className={`${styles.topInput} ${errors.machineNo ? styles.errorInput : ""}`}
              value={machineNo}
              onChange={(nextValue) => {
                setMachineNo(nextValue);
                clearFieldError("machineNo");
              }}
              options={machineOptions}
              placeholder="Select Machine No."
              ariaLabel="Machine No."
            />
          </div>
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

export default DrawFrameWheelChange;