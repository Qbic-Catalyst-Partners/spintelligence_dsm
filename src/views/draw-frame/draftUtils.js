const parseNumericValue = (value) => {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const computeType3D50TotalDraft = ({ delHank, feedHank, noOfEnds }) => {
  const deliveryHank = parseNumericValue(delHank);
  const feedHankValue = parseNumericValue(feedHank);
  const ends = parseNumericValue(noOfEnds);

  if (deliveryHank === null || feedHankValue === null || ends === null || feedHankValue === 0) {
    return "";
  }

  return String(((deliveryHank / feedHank) * ends).toFixed(2));
};

module.exports = {
  computeType3D50TotalDraft,
};
