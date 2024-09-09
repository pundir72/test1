import moment from "moment";

function timeRangeCal(time, fromdate, todate) {
  let startDate, endDate;
  if (!fromdate) {
    if (time === "today") {
      startDate = moment().utc().startOf("day");
      endDate = moment().utc().endOf("day");
    } else if (time === "yesterday") {
      startDate = moment().utc().subtract(1, "days").startOf("day");
      endDate = moment().utc().subtract(1, "days").endOf("day");
    } else if (time === "7days" || time === "7 days") {
      startDate = moment().utc().subtract(7, "days");
      endDate = moment().utc();
    } else if (time === "15days" || time === "15 days") {
      startDate = moment().utc().subtract(15, "days");
      endDate = moment().utc();
    } else if (time === "lastmonth" || time === "1 month") {
      startDate = moment().utc().subtract(1, "months").startOf("month");
      endDate = moment().utc().subtract(1, "months").endOf("month");
    } else if (time === "thismonth") {
      startDate = moment().utc().startOf("month");
      endDate = moment().utc().endOf("month");
    }
  } else {
    startDate = moment(fromdate).startOf("day");
    endDate = moment(todate).endOf("day");
  }
  return { startDate, endDate };
}

export default { timeRangeCal };
