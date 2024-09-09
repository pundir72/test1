import devicesLot from "../models/devicesLotModel.js";
import mongoose from "mongoose";
import moment from "moment";
const StoreErr = "Request Missing Store Info";
const PickDelivered = "Pickup Delivered At Warehouse"; //Technican
const ApprovDelivery = "Approved Delivery At Warehouse"; //Admin Manager
const FinalStatus = "Payment Confirmed"; //Admin Manager
const DevList = "$deviceList";
const LeadData = "$leadsData";
const LeadDataUID = "leadsData.userId";
const UserDataSID = "userData.storeId";
const StrData = "$storeData";
const lotsPipe = [
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
      localField: UserDataSID,
      foreignField: "_id",
      as: "storeData",
    },
  },
  {
    $unwind: StrData,
  },
  { $sort: { updatedAt: -1 } },
];

const LotsProject = [
  {
    $project: {
      leadsData: 0,
      storeData: 0,
      userData: 0,
    },
  },
];

const LotsByIDPipe = [
  {
    $unwind: DevList,
  },
  {
    $lookup: {
      from: "leads",
      localField: "deviceList",
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
    $unwind: "$userData", // Unwind the array created by $lookup
  },
  {
    $lookup: {
      from: "stores",
      foreignField: "_id",
      localField: "userData.storeId",
      as: "storeData",
    },
  },
  {
    $unwind: "$storeData", // Unwind the array created by $lookup
  },
  {
    $lookup: {
      from: "models",
      foreignField: "_id",
      localField: "leadsData.modelId",
      as: "modelData",
    },
  },
  {
    $unwind: "$modelData",
  },
  {
    $lookup: {
      from: "documents",
      foreignField: "_id",
      localField: "leadsData.documentId",
      as: "docData",
    },
  },
  {
    $unwind: "$docData",
  },
  { $sort: { "leadsData.createdAt": -1 } },
  {
    $project: {
      _id: "$leadsData._id",
      location: {
        $concat: ["$storeData.storeName", " - ", "$storeData.region"]
      },
      modelName: "$modelData.name",
      ramConfig: "$modelData.config",
      imei: "$docData.IMEI",
      leadsData: {
      $mergeObjects: [
        "$leadsData",
        { price: { $add: ["$leadsData.price", "$leadsData.bonusPrice"] } }, // Sum of price and bonusPrice
      ],
    },
    },
  },
];

const allLots = async (req, res) => {
  let lotsList;
  const qregion = req.query.region;
  const qstoreName = req.query.storeName;
  if (!qregion || !qstoreName) {
    return res.status(500).json({ msg: StoreErr });
  }
  const qrole = req.query.userRole || "Admin";
  let matchCriteria = { status: { $ne: ApprovDelivery } };
  if (qrole !== "Admin") {
    matchCriteria = { status: { $nin: [FinalStatus, ApprovDelivery, PickDelivered]}}
  }

  try {
    lotsList = await devicesLot.aggregate([
      { $match: matchCriteria },
      ...lotsPipe,
      {
        $match: {
          $and: [
            { "storeData.region": qregion },
            { "storeData.storeName": qstoreName },
          ],
        },
      },
      ...LotsProject,
    ]);
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Something went wrong, couldn't find Lots" });
  }
  return res
    .status(200)
    .json({ data: lotsList, message: "Successfully sent Lots" });
};

const searchLots = async (req, res) => {
  const rid = req.query.rid || "";
  const date = req.query.date || "";
  const qregion = req.query.region;
  const qstoreName = req.query.storeName;
  const qrole = req.query.userRole || "Admin";
  if (!qregion || !qstoreName) {
    return res.status(500).json({ msg: StoreErr });
  }
  let matchCriteria = { status: { $ne: ApprovDelivery } };
  if (qrole !== "Admin") {
    matchCriteria = { status: { $nin: [FinalStatus, ApprovDelivery, PickDelivered]}}
  }

  let lotData;
  try {
    lotData = await devicesLot.aggregate([
      {
        $match: matchCriteria,
      },
      ...lotsPipe,
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
            { uniqueCode: { $regex: "^" + rid, $options: "i" } },
            { tempDate: { $regex: "^" + date, $options: "i" } },
            { "storeData.region": qregion },
            { "storeData.storeName": qstoreName },
          ],
        },
      },
      ...LotsProject,
    ]);
  } catch (error) {
    return res.status(500).json({ msg: "Internal Server Error" });
  }
  return res
    .status(200)
    .json({ data: lotData, msg: "Successfully searched data" });
};

const lotsHistory = async (req, res) => {
  let lotsList;
  const qregion = req.query.region;
  const qstoreName = req.query.storeName;
  const qrole = req.query.userRole || "Admin";
  let matchCriteria = { status: ApprovDelivery };
  if (qrole !== "Admin") {
    matchCriteria = { status: { $in: [FinalStatus, ApprovDelivery, PickDelivered]}}
  }
  if (!qregion || !qstoreName) {
    return res.status(500).json({ msg: StoreErr });
  }

  try {
    lotsList = await devicesLot.aggregate([
      { $match: matchCriteria },
      ...lotsPipe,
      {
        $match: {
          $and: [
            { "storeData.region": qregion },
            { "storeData.storeName": qstoreName },
          ],
        },
      },
      ...LotsProject,
    ]);
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Something went wrong, couldn't find Lots History" });
  }

  return res
    .status(200)
    .json({ data: lotsList, message: "Successfully sended Lots History" });
};

const updateStatus = async (req, res) => {
  const { refIDs, newStatus } = req.body;
  let updateDevice;
  try {
    updateDevice = await devicesLot.updateMany(
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

const devicesList = async (req, res) => {
  const refId = req.params.rid;
  let deviceList;

  try {
    deviceList = await devicesLot.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(refId) },
      },
      ...LotsByIDPipe,
    ]);
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Something went wrong, couldn't find devices" });
  }

  return res
    .status(200)
    .json({ data: deviceList, message: "Successfully sended devicesList" });
};

const technicianReport = async (req, res) => {
  const { search, fromdate, todate } = req.query;
  let startDate, endDate;

  const match = {};

  if (fromdate) {
    startDate = moment(fromdate).startOf("day");
    endDate = moment(todate).endOf("day");
  }

  if (startDate) {
    match.updatedAt = { $gte: startDate.toDate(), $lte: endDate.toDate() };
  }

  try {
    const aggregationPipeline = [
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            userId: "$userId",
            storeId: "$storeId",
          },
          totalDevice: { $sum: "$totalDevice" },
          docs: { $push: "$$ROOT" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id.userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $lookup: {
          from: "stores",
          localField: "_id.storeId",
          foreignField: "_id",
          as: "store",
        },
      },
      {
        $unwind: "$store",
      },
      {
        $sort: { "_id.date": -1 }, // sort by date in descending order
      },
      {
        $project: {
          "_id.date": 1,
          totalDevice: 1,
          "user._id": 1,
          "user.firstName": 1,
          "user.lastName": 1,
          "store.storeName": 1,
        },
      },
    ];

    if (search) {
      aggregationPipeline.push({
        $match: {
          $or: [
            { "user.name": { $regex: "^" + search, $options: "i" } },
            { "store.storeName": { $regex: "^" + search, $options: "i" } },
          ],
        },
      });
    }

    const query = [{ $match: match }];

    const result = await devicesLot.aggregate([
      ...query,
      ...aggregationPipeline,
    ]);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({message: "Internal Server Error", error: err.toString()});
  }
};

export default {
  allLots,
  searchLots,
  updateStatus,
  devicesList,
  lotsHistory,
  technicianReport,
  LotsByIDPipe,
};
