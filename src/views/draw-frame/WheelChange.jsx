import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import InputScreenUploadButton from "@/components/InputScreenUploadButton";
import SearchableSelect from "@/components/SearchableSelect";
import { fetchSimplexUqcMasterDropdown } from "@/apis/simplex";
import { fetchDrawFrameWheelChangeEntries } from "@/apis/drawFrameWheelChange";
import { sanitizeNumericInput } from "@/utils/inputValidation";
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
const DRAFT_STORAGE_KEY = "draw_frame_wheel_change_last_values";
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
  { key: "lrsbCreelTensionDraft", label: "Creel Tension (W1) /Creel Draft", inputType: "select" },
  { key: "lrsbWebTensionDraft", label: "Web Tension Wheel (W3) / Web Tension Draft", inputType: "select" },
  { key: "lrsbBottomRollerFront", label: "Bottom Roller Setting Front Zone / Gauge in MM", inputType: "select" },
  { key: "lrsbBottomRollerBack", label: "Bottom Roller Setting Back Zone / Gauge in MM", inputType: "select" },
  { key: "lrsbScanningRoller", label: "Scanning Roller in mm", inputType: "select" },
  { key: "lrsbScanningRollerLower", label: "Scanning Roller Load (kg)", inputType: "select" },
  { key: "lrsbSilverFunnel", label: "Silver Funnel", inputType: "select" },
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

const normalizeTd7DraftValue = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed.toString() : "";
};

const getTd7G1G2ForTotalDraft = (value) => {
  const normalizedValue = normalizeTd7DraftValue(value);
  return TD7_TOTAL_DRAFT_TO_G1_G2_MAP[normalizedValue] || "";
};

const applyType2Td7AutoFill = (nextValues, changedRowKey = "", wheelChangeType = "") => {
  if (!TD7_LIKE_WHEEL_CHANGE_TYPES.includes(wheelChangeType)) return nextValues;
  if (!["totalDraftGear", "totalDraftFormula"].includes(changedRowKey)) return nextValues;

  const draftValue = nextValues.totalDraftGear?.existing || nextValues.totalDraftGear?.proposed || "";
  const autoG1G2 = getTd7G1G2ForTotalDraft(draftValue);
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

const computeType4Ldf3sTotalDraft = ({ deliveryHank, feedHank, noOfEnds }) => {
  const deliveryHankValue = parseNumericValue(deliveryHank);
  const feedHankValue = parseNumericValue(feedHank);
  const noOfEndsValue = parseNumericValue(noOfEnds);
  if (deliveryHankValue === null || feedHankValue === null || noOfEndsValue === null || feedHankValue === 0) return "";
  return String(((deliveryHankValue / feedHankValue) * noOfEndsValue).toFixed(2));
};

const DRAW_FRAME_NW_OPTIONS = Array.from({ length: 70 - 23 + 1 }, (_, index) => String(23 + index));
const DRAW_FRAME_BREAK_DRAFT_OPTIONS = Array.from({ length: 70 - 52 + 1 }, (_, index) => String(52 + index));
const DRAW_FRAME_W1VWZ_OPTIONS = ["143.9", "145.3", "146.7", "148.1", "149.5", "152.3"];
const DRAW_FRAME_W3DR_OPTIONS = ["0.9", "1", "1.01", "1.02", "1.03"];
const DRAW_FRAME_W8DR_OPTIONS = ["0.97", "0.98", "0.99", "1", "1.02", "1.03"];
const DRAW_FRAME_W4_OPTIONS = [
  "77.4",
  "72.2",
  "70.3",
  "65.5",
  "63.8",
  "59.6",
  "57.9",
  "54",
  "52.7",
  "49.1",
  "48",
  "44.8",
  "43.5",
  "40.7",
  "39.6",
  "36.9",
];
const DRAW_FRAME_TRUMPET_OPTIONS = ["3.8", "4.2"];
const DRAW_FRAME_D40_NW_OPTIONS = Array.from({ length: 75 - 30 + 1 }, (_, index) => String(30 + index));
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
const TD7_TOTAL_DRAFT_TO_G1_G2_MAP = {
  "4": "62.98/40",
  "4.2": "60.05/40",
  "4.3": "58.59/40",
  "4.4": "57.12/40",
  "4.6": "55.66/40",
  "4.7": "54.19/40",
  "4.8": "52.73/40",
  "5": "51.26/40",
  "5.1": "49.8/40",
  "5.3": "48.33/40",
  "5.5": "60.05/31",
  "5.6": "58.59/31",
  "5.7": "57.12/31",
  "5.9": "55.66/31",
  "6.1": "54.19/31",
  "6.2": "52.73/31",
  "6.4": "51.26/31",
  "6.6": "49.8/31",
  "6.8": "48.33/31",
  "7": "46.87/31",
  "7.2": "45.4/31",
  "7.4": "57.12/24",
  "7.6": "55.66/24",
  "7.8": "54.19/24",
  "8": "52.73/24",
  "8.3": "51.26/24",
  "8.5": "49.8/24",
  "8.8": "48.33/24",
  "9": "46.87/24",
  "9.3": "45.4/24",
  "9.6": "43.94/24",
  "10": "42.27/24",
};
const DRAW_FRAME_TD7_G1_G2_OPTIONS = [
  { value: "62.98/40", label: "62.98 / 40" },
  { value: "60.05/40", label: "60.05 / 40" },
  { value: "58.59/40", label: "58.59 / 40" },
  { value: "57.12/40", label: "57.12 / 40" },
  { value: "55.66/40", label: "55.66 / 40" },
  { value: "54.19/40", label: "54.19 / 40" },
  { value: "52.73/40", label: "52.73 / 40" },
  { value: "51.26/40", label: "51.26 / 40" },
  { value: "49.8/40", label: "49.8 / 40" },
  { value: "48.33/40", label: "48.33 / 40" },
  { value: "60.05/31", label: "60.05 / 31" },
  { value: "58.59/31", label: "58.59 / 31" },
  { value: "57.12/31", label: "57.12 / 31" },
  { value: "55.66/31", label: "55.66 / 31" },
  { value: "54.19/31", label: "54.19 / 31" },
  { value: "52.73/31", label: "52.73 / 31" },
  { value: "51.26/31", label: "51.26 / 31" },
  { value: "49.8/31", label: "49.8 / 31" },
  { value: "48.33/31", label: "48.33 / 31" },
  { value: "46.87/31", label: "46.87 / 31" },
  { value: "45.4/31", label: "45.4 / 31" },
  { value: "57.12/24", label: "57.12 / 24" },
  { value: "55.66/24", label: "55.66 / 24" },
  { value: "54.19/24", label: "54.19 / 24" },
  { value: "52.73/24", label: "52.73 / 24" },
  { value: "51.26/24", label: "51.26 / 24" },
  { value: "49.8/24", label: "49.8 / 24" },
  { value: "48.33/24", label: "48.33 / 24" },
  { value: "46.87/24", label: "46.87 / 24" },
  { value: "45.4/24", label: "45.4 / 24" },
  { value: "43.94/24", label: "43.94 / 24" },
  { value: "42.27/24", label: "42.27 / 24" },
];
const DRAW_FRAME_TD7_BDCP_OPTIONS = [
  { value: "1.038", label: "1.038 / 26" },
  { value: "1.080", label: "1.080 / 25" },
  { value: "1.125", label: "1.125 / 24" },
  { value: "1.174", label: "1.174 / 23" },
  { value: "1.227", label: "1.227 / 22" },
  { value: "1.286", label: "1.286 / 21" },
  { value: "1.350", label: "1.350 / 20" },
  { value: "1.421", label: "1.421 / 19" },
  { value: "1.500", label: "1.500 / 18" },
  { value: "1.588", label: "1.588 / 17" },
  { value: "1.688", label: "1.688 / 16" },
];
const DRAW_FRAME_TD7_WEB_TENSION_OPTIONS = [
  { value: "87", label: "87 / 0.99" },
  { value: "86.5", label: "86.5 / 0.995" },
  { value: "86.1", label: "86.1 / 1" },
  { value: "85.7", label: "85.7 / 1.005" },
  { value: "85.2", label: "85.2 / 1.011" },
  { value: "84.8", label: "84.8 / 1.015" },
  { value: "84.4", label: "84.4 / 1.02" },
  { value: "84", label: "84 / 1.025" },
  { value: "83.6", label: "83.6 / 1.03" },
  { value: "83.2", label: "83.2 / 1.035" },
  { value: "82.8", label: "82.8 / 1.04" },
  { value: "82.4", label: "82.4 / 1.045" },
  { value: "82", label: "82 / 1.05" },
  { value: "81.6", label: "81.6 / 1.055" },
  { value: "81.2", label: "81.2 / 1.06" },
  { value: "80.8", label: "80.8 / 1.066" },
  { value: "80.5", label: "80.5 / 1.07" },
];
const DRAW_FRAME_TD7_BOTTOM_ROLLER_FRONT_OPTIONS = [
  { value: "37.8", label: "37.8 / 1.5" },
  { value: "38.4", label: "38.4 / 2" },
  { value: "38.9", label: "38.9 / 2.5" },
  { value: "39.4", label: "39.4 / 3" },
  { value: "39.9", label: "39.9 / 3.5" },
  { value: "40.4", label: "40.4 / 4" },
  { value: "40.9", label: "40.9 / 4.5" },
  { value: "41.4", label: "41.4 / 5" },
  { value: "42", label: "42 / 5.5" },
  { value: "42.5", label: "42.5 / 6" },
  { value: "43", label: "43 / 6.5" },
  { value: "43.5", label: "43.5 / 7" },
  { value: "44", label: "44 / 7.5" },
  { value: "44.5", label: "44.5 / 8" },
  { value: "45", label: "45 / 8.5" },
  { value: "45.5", label: "45.5 / 9" },
  { value: "46", label: "46 / 9.5" },
  { value: "46.6", label: "46.6 / 10" },
  { value: "47.1", label: "47.1 / 10.5" },
  { value: "47.6", label: "47.6 / 11" },
  { value: "48.1", label: "48.1 / 11.5" },
  { value: "48.6", label: "48.6 / 12" },
  { value: "49.1", label: "49.1 / 12.5" },
  { value: "49.6", label: "49.6 / 13" },
  { value: "50.1", label: "50.1 / 13.5" },
  { value: "50.6", label: "50.6 / 14" },
  { value: "51.1", label: "51.1 / 14.5" },
  { value: "51.6", label: "51.6 / 15" },
  { value: "52.2", label: "52.2 / 15.5" },
  { value: "52.7", label: "52.7 / 16" },
  { value: "53.2", label: "53.2 / 16.5" },
  { value: "53.7", label: "53.7 / 17" },
  { value: "54.2", label: "54.2 / 17.5" },
  { value: "54.7", label: "54.7 / 18" },
  { value: "55.2", label: "55.2 / 18.5" },
  { value: "55.7", label: "55.7 / 19" },
  { value: "56.2", label: "56.2 / 19.5" },
  { value: "56.7", label: "56.7 / 20" },
  { value: "57.2", label: "57.2 / 20.5" },
  { value: "57.7", label: "57.7 / 21" },
  { value: "58.2", label: "58.2 / 21.5" },
  { value: "58.8", label: "58.8 / 22" },
  { value: "59.3", label: "59.3 / 22.5" },
  { value: "59.8", label: "59.8 / 23" },
];
const DRAW_FRAME_TD7_BOTTOM_ROLLER_BACK_OPTIONS = [
  { value: "44.5", label: "44.5 / 6.5" },
  { value: "45", label: "45 / 7" },
  { value: "45.5", label: "45.5 / 7.5" },
  { value: "46", label: "46 / 8" },
  { value: "46.5", label: "46.5 / 8.5" },
  { value: "47", label: "47 / 9" },
  { value: "47.5", label: "47.5 / 9.5" },
  { value: "48", label: "48 / 10" },
  { value: "48.5", label: "48.5 / 10.5" },
  { value: "49", label: "49 / 11" },
  { value: "49.5", label: "49.5 / 11.5" },
  { value: "50", label: "50 / 12" },
  { value: "50.5", label: "50.5 / 12.5" },
  { value: "51", label: "51 / 13" },
  { value: "51.5", label: "51.5 / 13.5" },
  { value: "52", label: "52 / 14" },
  { value: "52.5", label: "52.5 / 14.5" },
  { value: "53", label: "53 / 15" },
  { value: "53.5", label: "53.5 / 15.5" },
  { value: "54", label: "54 / 16" },
  { value: "54.5", label: "54.5 / 16.5" },
  { value: "55", label: "55 / 17" },
  { value: "55.5", label: "55.5 / 17.5" },
  { value: "56", label: "56 / 18" },
  { value: "56.5", label: "56.5 / 18.5" },
  { value: "57", label: "57 / 19" },
  { value: "57.5", label: "57.5 / 19.5" },
  { value: "58", label: "58 / 20" },
  { value: "58.5", label: "58.5 / 20.5" },
  { value: "59", label: "59 / 21" },
  { value: "59.5", label: "59.5 / 21.5" },
  { value: "60", label: "60 / 22" },
  { value: "60.5", label: "60.5 / 22.5" },
  { value: "61", label: "61 / 23" },
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
  trumpet: DRAW_FRAME_TRUMPET_OPTIONS,
  bottomRollerFront: DRAW_FRAME_BOTTOM_ROLLER_FRONT_OPTIONS,
  bottomRollerBack: DRAW_FRAME_BOTTOM_ROLLER_BACK_OPTIONS,
  g1G2: ["G1/G2", "G1", "G2"],
  lrsbNw1: DRAW_FRAME_NW_OPTIONS,
  lrsbNw2: DRAW_FRAME_NW_OPTIONS,
  lrsbBackRollerPulley: DRAW_FRAME_W4_OPTIONS,
  lrsbMiddleRollerPulley: DRAW_FRAME_W1VWZ_OPTIONS,
  lrsbCreelTensionDraft: DRAW_FRAME_W1VWZ_OPTIONS,
  lrsbWebTensionDraft: DRAW_FRAME_W3DR_OPTIONS,
  lrsbBottomRollerFront: DRAW_FRAME_BOTTOM_ROLLER_FRONT_OPTIONS,
  lrsbBottomRollerBack: DRAW_FRAME_BOTTOM_ROLLER_BACK_OPTIONS,
  lrsbScanningRoller: DRAW_FRAME_SCANNING_ROLLER_OPTIONS,
  lrsbScanningRollerLower: DRAW_FRAME_SCANNING_ROLLER_LOWER_OPTIONS,
  lrsbSilverFunnel: DRAW_FRAME_SILVER_FUNNEL_OPTIONS,
  lrsbWebGuideTube: DRAW_FRAME_WEB_GUIDE_TUBE_OPTIONS,
  lrsbSliverWireSize: DRAW_FRAME_INSERT_BORE_DIA_OPTIONS,
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
    switch (rowKey) {
      case "totalDraftGear":
        return DRAW_FRAME_TD7_TOTAL_DRAFT_OPTIONS;
      case "g1G2":
        return DRAW_FRAME_TD7_G1_G2_OPTIONS;
      case "bdcp":
        return DRAW_FRAME_TD7_BDCP_OPTIONS;
      case "webTension":
        return DRAW_FRAME_TD7_WEB_TENSION_OPTIONS;
      case "bottomRollerFront":
        return DRAW_FRAME_TD7_BOTTOM_ROLLER_FRONT_OPTIONS;
      case "bottomRollerBack":
        return DRAW_FRAME_TD7_BOTTOM_ROLLER_BACK_OPTIONS;
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
  },
  ref
) {
  const [wheelChangeType, setWheelChangeType] = useState("");
  const [lineType, setLineType] = useState("");
  const [date, setDate] = useState(getTodayDate);
  const [values, setValues] = useState(createValues);
  const [errors, setErrors] = useState({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [mixingOptions, setMixingOptions] = useState([]);
  const lastLoadedMixingRef = useRef("");

  const activeRows = useMemo(
    () => (wheelChangeType ? ROWS_BY_TYPE[wheelChangeType] || [] : []),
    [wheelChangeType]
  );
  const selectedMixingRow = activeRows.find(
    (row) => row.key.toLowerCase().includes("mixing") || row.label.toLowerCase().includes("mixing")
  );
  const selectedMixing = String(values[selectedMixingRow?.key]?.existing || values[selectedMixingRow?.key]?.proposed || "").trim();
  const availableWheelChangeTypes = useMemo(
    () => WHEEL_CHANGE_TYPES_BY_LINE[lineType] || [],
    [lineType]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || "{}");
      if (stored && typeof stored === "object") {
        setWheelChangeType(typeof stored.wheelChangeType === "string" ? stored.wheelChangeType : "");
        setLineType(typeof stored.lineType === "string" ? stored.lineType : "");
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
      try {
        const dropdown = await fetchSimplexUqcMasterDropdown({ department: "SIMPLEX" });
        if (!active) return;
        setMixingOptions(Array.isArray(dropdown?.varietyNames) ? dropdown.varietyNames : []);
      } catch {
        if (!active) return;
        setMixingOptions([]);
      }
    };

    loadDropdowns();

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
        date,
        values,
      })
    );
  }, [date, draftLoaded, lineType, values, wheelChangeType]);

  const loadLatestSaved = async (requestedWheelChangeType = wheelChangeType, mixingValue = "") => {
    const apiWheelChangeType = getApiWheelChangeType(requestedWheelChangeType);
    const params = {
      page: 1,
      limit: 1,
      wheelChangeType: apiWheelChangeType,
    };
    const trimmedMixing = String(mixingValue || "").trim();
    if (trimmedMixing) {
      params.variety = trimmedMixing;
      params.variety_name = trimmedMixing;
      params.mixing = trimmedMixing;
    }
    const payload = await fetchDrawFrameWheelChangeEntries(params);
    const latest = extractLatestEntry(payload);
    if (!latest) return null;

    const savedWheelChangeType =
      WHEEL_CHANGE_TYPES.includes(latest.wheel_change_type_label)
        ? latest.wheel_change_type_label
        : normalizeApiWheelChangeType(latest.wheel_change_type);
    const savedLineType =
      String(latest.line_type || "") ||
      getLineTypeForWheelChangeType(savedWheelChangeType || requestedWheelChangeType);

    setWheelChangeType(savedWheelChangeType || requestedWheelChangeType);
    setLineType(savedLineType);
    setDate(toInputDate(latest.entry_date || latest.date || latest.created_at) || getTodayDate());
    setValues(buildValuesFromParameters(pickSavedRows(latest)));
    setErrors({});
    return latest;
  };

  useEffect(() => {
    if (!draftLoaded || !wheelChangeType || !selectedMixing) {
      lastLoadedMixingRef.current = "";
      return;
    }

    const selectionKey = `${wheelChangeType}::${selectedMixing}`;
    if (lastLoadedMixingRef.current === selectionKey) return;

    let cancelled = false;
    loadLatestSaved(wheelChangeType, selectedMixing)
      .then((latest) => {
        if (cancelled || !latest) return;
        lastLoadedMixingRef.current = selectionKey;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [draftLoaded, selectedMixing, wheelChangeType]);

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

    const draftValue = values.totalDraftGear?.existing || values.totalDraftGear?.proposed || "";
    const autoG1G2 = getTd7G1G2ForTotalDraft(draftValue);
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

  const handleValueChange = (rowKey, column) => (event) => {
    const nextValue = event.target.value;
    setValues((current) => {
      const updatedValues = applyType1Sb20ComputedValues({
        ...current,
        [rowKey]: {
          ...(current[rowKey] || { existing: "", proposed: "" }),
          [column]: nextValue,
        },
      });
      return applyType2Td7AutoFill(updatedValues, rowKey, wheelChangeType);
    });
    clearValueError(rowKey, column);
  };

  const handleNumericValueChange = (rowKey, column) => (event) => {
    const nextValue = sanitizeNumericInput(event.target.value, { precision: 10, scale: 3 });
    setValues((current) => {
      const updatedValues = applyType1Sb20ComputedValues({
        ...current,
        [rowKey]: {
          ...(current[rowKey] || { existing: "", proposed: "" }),
          [column]: nextValue,
        },
      });
      return applyType2Td7AutoFill(updatedValues, rowKey, wheelChangeType);
    });
    clearValueError(rowKey, column);
  };

  const clear = () => {
    setWheelChangeType("");
    setLineType("");
    setDate(getTodayDate());
    setValues(createValues());
    setErrors({});
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
    if (!date) nextErrors.date = true;

    const valueErrors = {};
    activeRows.forEach((row) => {
      const rowValues = values[row.key] || {};
      const rowErrors = {};
      if (hasTextValue(rowValues.existing) && parseNumericValue(rowValues.existing) === null) {
        rowErrors.existing = true;
      }
      if (hasTextValue(rowValues.proposed) && parseNumericValue(rowValues.proposed) === null) {
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
      line_type: lineType,
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
    { label: "Checking Type", value: selectedTypeName || "-" },
    { label: "Line Type", value: lineType || "-" },
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

    if (row.inputType === "select" && (row.key.toLowerCase().includes("mixing") || row.label.toLowerCase().includes("mixing"))) {
      return (
        <SearchableSelect
          className={className}
          value={value}
          onChange={handleValueChange(row.key, column)}
          options={mixingOptions}
          placeholder="Select"
          ariaLabel={row.label}
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

    return (
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className={className}
        value={value}
        onChange={handleNumericValueChange(row.key, column)}
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

export default DrawFrameWheelChange;
