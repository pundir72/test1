import leads from "../models/leadsModel.js";
import devicesLot from "../models/devicesLotModel.js";
import outstandingLot from "../models/outstandingLotModel.js";
import mongoose from "mongoose";
const ISE = "Internal Server Error, Failed To Create New Lot";
const bonusPriceField = "$bonusPrice";
const getAllLeadsPipe = [
  {
    $match: {
      $and: [
        { is_selled: true },
        { status: { $ne: "Pending" } },
        { status: { $ne: "Completed" } },
      ],
    },
  },
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "userData",
    },
  },
  {
    $unwind: "$userData",
  },
  {
    $lookup: {
      from: "models",
      localField: "modelId",
      foreignField: "_id",
      as: "modelData",
    },
  },
  {
    $unwind: "$modelData",
  },
  {
    $lookup: {
      from: "documents",
      localField: "documentId",
      foreignField: "_id",
      as: "docData",
    },
  },
  {
    $unwind: "$docData",
  },
  {
    $lookup: {
      from: "stores",
      localField: "userData.storeId",
      foreignField: "_id",
      as: "storeData",
    },
  },
  {
    $unwind: "$storeData",
  },
  { $sort: { updatedAt: -1 } },
];

const AllLeadsProjection = [
  {
    $project: {
      is_selled: 1,
      status: 1,
      modelId: 1,
      storage: 1,
      price: { $add: ["$price", bonusPriceField] },
      createdAt: 1,
      updatedAt: 1,
      modelName: "$modelData.name",
      ramConfig: "$modelData.config",
      location: "$storeData.region",
      imei: "$docData.IMEI",
      reason: 1,
    },
  },
  {
    $group: {
      _id: null,
      totalPrice: { $sum: "$price" },
      count: { $sum: 1 },
      documents: { $push: "$$ROOT" },
    },
  },
  {
    $project: {
      _id: 0,
      totalPrices: "$totalPrice",
      count: "$count",
      documents: 1,
    },
  },
];

const allDevices = async (req, res) => {
  let deviceList;
  const qregion = req.query.region;
  const qstoreName = req.query.storeName;

  if (!qregion || !qstoreName) {
    return res.status(500).json({ msg: "Request missing store info" });
  }

  try {
    deviceList = await leads.aggregate([
      ...getAllLeadsPipe,
      {
        $match: {
          $and: [
            { "storeData.region": qregion },
            { "storeData.storeName": qstoreName },
          ],
        },
      },
      ...AllLeadsProjection,
    ]);
  } catch (err) {
    return res
      .status(500)
      .json({ msg: "Internal Server Error, Failed To Find Devices" });
  }
  return res
    .status(200)
    .json({ data: deviceList, message: "Successfully Sent Devices" });
};

const searchDevice = async (req, res) => {
  const rid = req.query.rid || "";
  const date = req.query.date || "";
  const status = req.query.status || "";
  const qregion = req.query.region;
  const qstoreName = req.query.storeName;

  if (!qregion || !qstoreName) {
    return res.status(500).json({ msg: "Request missing store info" });
  }

  let deviceList;
  try {
    deviceList = await leads.aggregate([
      ...getAllLeadsPipe,
      {
        $addFields: {
          tempId: { $toString: "$_id" },
          tempDate: {
            $dateToString: {
              format: "%d/%m/%Y",
              date: "$createdAt",
            },
          },
        },
      },
      {
        $match: {
          $and: [
            {
              $or: [
                { tempId: { $regex: "^" + rid, $options: "i" } },
                { "modelData.name": { $regex: rid, $options: "i" } },
                { "docData.IMEI": { $regex: rid, $options: "i" } },
              ],
            },
            { tempDate: { $regex: "^" + date, $options: "i" } },
            { status: { $regex: "^" + status, $options: "i" } },
            { "storeData.region": qregion },
            { "storeData.storeName": qstoreName },
          ],
        },
      },
      ...AllLeadsProjection,
    ]);
  } catch (err) {
    return res
      .status(500)
      .json({ msg: "Internal Server Error, Failed To Search Devices" });
  }
  return res
    .status(200)
    .json({ data: deviceList, message: "Successfully Searched Devices" });
};

// update status of lead
const updateStatus = async (req, res) => {
  const { deviceIDs, newStatus, reason } = req.body; //Here deviceIDs means devieStatus _id not lead id

  let updateDevice;
  try {
    updateDevice = await leads.updateMany(
      { _id: { $in: deviceIDs } },
      { $set: { status: newStatus, reason: reason } }
    );
  } catch (err) {
    return res
      .status(500)
      .json({ msg: "Updating status failed, Please try again." });
  }

  return res.status(200).json({
    data: updateDevice,
    message: "Successfully updated devices status",
  });
};

// create lot and add to outstanding page
const updateRequest = async (req, res) => {
  const { deviceIDs, newStatus } = req.body; //HEre id is lead _id

  let calculations;

  const newIDs = deviceIDs.map((el) => {
    return new mongoose.Types.ObjectId(el); //aggregation only take mdb obj type ids as a id
  });

  try {
    calculations = await leads.aggregate([
      { $match: { _id: { $in: newIDs } } },
      {
        $addFields: {
          price: { $add: ["$price", bonusPriceField] }, // Calculate sum of price and bonusPrice
        },
      },
      {
        $group: {
          _id: "000",
          totalSum: { $sum: "$price" },
          count: { $sum: 1 },
        },
      },
    ]);
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Something went wrong, calculations failed" });
  }

  const createdDevicesLot = new outstandingLot({
    status: "Pending Payroll Approval",
    request: newStatus,
    totalDevice: calculations[0].count,
    totalAmount: calculations[0].totalSum,
    deviceList: deviceIDs,
  });

  try {
    await createdDevicesLot.save();
    try {
      await leads.updateMany(
        { _id: { $in: deviceIDs } },
        { $set: { status: "Pending" } }
      );
    } catch (error) {
      await outstandingLot.deleteOne({ _id: createdDevicesLot._id });
      return res.status(500).json({ msg: ISE });
    }
  } catch (error) {
    return res.status(500).json({ msg: ISE });
  }
  return res
    .status(200)
    .json({ data: createdDevicesLot, msg: "Successfully created new lot" });
};

// Create lot and add lot to Pickup Devices page
const pickupRequest = async (req, res) => {
  let { deviceIDs, userid, storeid } = await req.body; //id is lead _id

  let calculations;

  deviceIDs = deviceIDs.map((el) => {
    return new mongoose.Types.ObjectId(el); //aggregation only take mdb obj type ids as a id
  });
  deviceIDs = await leads.distinct("_id", {
    status: { $ne: "Completed" },
    _id: { $in: deviceIDs },
  });
  try {
    calculations = await leads.aggregate([
      {
        $match: {
          _id: { $in: deviceIDs },
        },
      },
      {
        $addFields: {
          price: { $add: ["$price", bonusPriceField] }, // Calculate sum of price and bonusPrice
        },
      },
      {
        $group: {
          _id: "000",
          totalSum: { $sum: "$price" },
          count: { $sum: 1 },
        },
      },
    ]);
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Something went wrong, calculations failed" });
  }
  const lastDoc = await devicesLot
    .findOne({ uniqueCode: { $ne: "" } })
    .sort({ createdAt: -1 });
  const inputString = req?.storeName || "GREST";
  const words = inputString?.split(" ");
  const firstCharacters = words.map((word) => word.charAt(0));
  const resultString = firstCharacters.join("");
  let uniqueCode = "GRCTBLTG100";
  if (lastDoc) {
    const numbersArray = lastDoc?.uniqueCode?.match(/\d+/g);
    const code = numbersArray ? Number(numbersArray.join("")) : 0;
    const nextCode = (code + 1).toString().padStart(3, "0"); // Ensure three digits with leading zeros
    uniqueCode = `GRC2BLT${resultString}${Number(nextCode) + 1}`;
  }

  const createdDevicesLot = new devicesLot({
    status: "Pending Payment Confirmation",
    totalDevice: calculations[0].count,
    totalAmount: calculations[0].totalSum,
    deviceList: deviceIDs,
    userId: userid,
    storeId: storeid,
    uniqueCode,
  });

  try {
    await createdDevicesLot.save();
    try {
      await leads.updateMany(
        { _id: { $in: deviceIDs } },
        { $set: { status: "Completed" } }
      );
    } catch (error) {
      await devicesLot.deleteOne({ _id: createdDevicesLot._id });
      return res.status(500).json({ msg: ISE, error: error });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ msg: ISE, error: error });
  }
  return res
    .status(200)
    .json({ data: createdDevicesLot, msg: "Successfully created new lot" });
};

export default {
  allDevices,
  searchDevice,
  updateStatus,
  updateRequest,
  pickupRequest,
};
