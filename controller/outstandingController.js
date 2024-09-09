import leads from "../models/leadsModel.js";
import outstandingLot from "../models/outstandingLotModel.js";
import mongoose from "mongoose";
const ReqFor = "Request Forwarded";
const DevList = "$deviceList";
const LeadData = "$leadsData";
const LeadDataUID = "leadsData.userId";
import pickupDevicesController from "./pickupDevicesController.js";
const LotsPipe = [
  {
    $addFields: {
      firstDeviceId: { $arrayElemAt: [DevList, 0] },
    },
  },
  {
    $lookup: {
      from: "leads",
      localField: "firstDeviceId",
      foreignField: "_id",
      as: "leadsData",
    },
  },
  {
    $unwind: LeadData,
  },
  {
    $lookup: {
      from: "users",
      localField: LeadDataUID,
      foreignField: "_id",
      as: "userData",
    },
  },
  {
    $unwind: "$userData",
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
]

const allLots = async (req, res) => {
  let lotsList;
  const qregion = req.query.region;
  const qstoreName = req.query.storeName;

  if (!qregion || !qstoreName) {
    return res.status(500).json({ msg: "Request missing store info" });
  }

  try {
    lotsList = await outstandingLot.aggregate([
      { $match: { status: { $ne: ReqFor } } },
      ...LotsPipe,
      {
        $match: {
          $and: [
            { "storeData.region": qregion },
            { "storeData.storeName": qstoreName },
          ],
        },
      },
      {
        $project: {
          leadsData: 0,
          storeData: 0,
          userData: 0,
        },
      },
    ]);
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Something went wrong, couldn't find Lots" });
  }
  return res
    .status(200)
    .json({ data: lotsList, msg: "Successfully sent Lots" });
};

const searchLots = async (req, res) => {
  const rid = req.query.rid || ""; // Default value is an empty string if rid is undefined
  const date = req.query.date || "";
  const qregion = req.query.region;
  const qstoreName = req.query.storeName;
  let lotData;

  if (!qregion || !qstoreName) {
    return res.status(500).json({ msg: "Request missing store info" });
  }

  try {
    lotData = await outstandingLot.aggregate([
      {
        $match: { status: { $ne: ReqFor } },
      },
      ...LotsPipe,
      {
        $addFields: {
          tempUserId: { $toString: "$_id" },
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
            { tempUserId: { $regex: "^" + rid, $options: "i" } },
            { tempDate: { $regex: "^" + date, $options: "i" } },
            { "storeData.region": qregion },
            { "storeData.storeName": qstoreName },
          ],
        },
      },
      {
        $project: {
          leadsData: 0,
          storeData: 0,
          userData: 0,
        },
      },
    ]);
  } catch (error) {
    return res.status(500).json({ msg: "Internal Server Error" });
  }
  return res
    .status(200)
    .json({ data: lotData, msg: "Successfully searched data" });
};

const updateStatus = async (req, res) => {
  const { refIDs, newStatus } = req.body;
  let updateDevice;
  try {
    updateDevice = await outstandingLot.updateMany(
      { _id: { $in: refIDs } },
      { $set: { status: newStatus } }
    );
  } catch (err) {
    return res
      .status(500)
      .json({ msg: "Updating lot's status failed, Please try again." });
  }
  return res
    .status(200)
    .json({ data: updateDevice, message: "Successfully updated lots status" });
};

const forwardRequest = async (req, res) => {
  const { refIDs } = req.body;

  let outStnLot;

  try {
    outStnLot = await outstandingLot.findOne({ _id: refIDs });
  } catch (error) {
    return res.status(500).json({ msg: "Lot not found with this ref_id" });
  }

  const deviceIDs = outStnLot.deviceList;
  const prev = outStnLot.request;

  try {
    await outstandingLot.updateMany(
      { _id: { $in: [refIDs] } },
      { $set: { status: ReqFor } }
    );
    try {
      await leads.updateMany(
        { _id: { $in: deviceIDs } },
        { $set: { status: prev } }
      );
    } catch (error) {
      await outstandingLot.updateMany(
        { _id: { $in: [refIDs] } },
        { $set: { status: outStnLot.status } }
      );
      return res
        .status(500)
        .json({ msg: "Failed to forward request, please try again" });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Failed to forward request, please try again" });
  }

  return res
    .status(200)
    .json({ data: outStnLot, message: "Successfully Forwarded Request" });
};

const devicesList = async (req, res) => {
  const refId = req.params.rid;
  try {
    const deviceList = await outstandingLot.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(refId) },
      },
      ...pickupDevicesController.LotsByIDPipe,
    ]);
    return res
      .status(200)
      .json({ data: deviceList, message: "Successfully sended devicesList" });
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Something went wrong, couldn't find devices" });
  }
};

export default {
  allLots,
  searchLots,
  updateStatus,
  devicesList,
  forwardRequest,
};
