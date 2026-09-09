/**
 * Adds N business days (Mon-Fri) to a date, skipping weekends.
 * Does not account for holidays -- add a holiday list here later if needed.
 */
function addBusinessDays(startDate, numDays) {
  const result = new Date(startDate);
  let added = 0;
  while (added < numDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return result;
}

module.exports = { addBusinessDays };
