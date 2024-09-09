import storeModel from "../models/storeModel.js";
import utils from "../utils/required.js";
import csv from "../controller/questionnaireController.js";
import devicesLotModel from "../models/devicesLotModel.js";
import leadModel from "../models/leadsModel.js";
import timeRangeCal from "../utils/timeRangeCal.js";
const ISE = "Internal Server Error";

const create = async (req, res) => {
  const userId = req.userId;
  req.body.createdBy = userId;

  try {
    const { error } = utils.storeValidation(req.body);
    if (error) {
      return res.status(400).send({ message: error.details[0].message });
    }
    const lastDoc = await storeModel
      .findOne({ uniqueId: { $ne: "" } })
      .sort({ createdAt: -1 });
    const inputString = req?.body.storeName || "Grest";
    const words = inputString?.split(" ");
    const firstCharacters = words.map((word) => word.charAt(0));
    const resultString = firstCharacters.join("");
    let uniqueId = "STORE100";
    if (lastDoc) {
      const numbersArray = lastDoc?.uniqueId?.match(/\d+/g);
      const code = numbersArray ? numbersArray.map(Number) : [];
      uniqueId = `STORE${resultString}${Number(code) + 1}`;
    }
    const result = await storeModel({
      storeName: req.body.storeName,
      uniqueId: uniqueId,
      email: req.body.email,
      contactNumber: req.body.contactNumber,
      region: req.body.region,
      address: req.body.address,
      createdBy: userId,
    }).save();
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ message: error.message, status: 500 });
  }
};

const update = async (req, res) => {
  const userId = req.userId;
  req.body.updatedBy = userId;
  delete req.body.createdBy;

  try {
    const result = await storeModel.findByIdAndUpdate(
      { _id: req.body._id || req.body.id },
      req.body,
      { new: true }
    );
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ message: error.message, status: 500 });
  }
};

const deleteById = async (req, res) => {
  try {
    const result = await storeModel.findByIdAndDelete({
      _id: req.query._id || req.query.id,
    });
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ message: error.message, status: 500 });
  }
};

const findById = async (req, res) => {
  try {
    const storeData = await storeModel.findById({
      _id: req.query._id || req.query.id,
    });
    return res.status(200).json({ result: storeData });
  } catch (error) {
    return res.status(500).json({ message: ISE, status: 500 });
  }
};

const findAll = async (req, res) => {
  try {
    const query = {};
    const search = req.query.search || "";
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 0;

    if (search) {
      query["$or"] = [
        { storeName: { $regex: search, $options: "i" } },
        { region: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { uniqueId: { $regex: search, $options: "i" } },
      ];
    }
    const allstore = await storeModel
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(limit * page);

    const totalRecords = await storeModel.countDocuments(query);
    return res.status(200).json({ result: allstore, totalRecords });
  } catch (error) {
    return res.status(500).json({ message: ISE, status: 500 });
  }
};

const uploadData = async (req, res) => {
  try {
    const data = csv.convertCsvToJson(req.file.buffer.toString().split("\n"));
    const updated = [];
    const inserted = [];

    for (let i = 0; i < data.length; i++) {
      const exists = await storeModel.findOne({
        storeName: { $regex: data[i].storeName, $options: "i" },
        region: data[i].region,
      });
      if (exists) {
        const up = await storeModel.findByIdAndUpdate(
          { _id: exists._id },
          data[i]
        );
        updated.push(up);
      } else {
        const saved = await storeModel(data[i]).save();
        inserted.push(saved);
      }
    }
    return res.status(200).json({ updated, inserted });
  } catch (error) {
    return res.status(500).json({ message: error.message, status: 500 });
  }
};

const adminReport = async (req, res) => {
  try {
    const { search, fromDate, toDate } = req.query;
    const query = {};
    const query1 = { is_selled: true };
    if (search) {
      query["data.storeName"] = { $regex: search, $options: "i" };
    }
    if (fromDate && toDate) {
      const { startDate, endDate } = timeRangeCal.timeRangeCal( "", fromDate, toDate);
      query1["createdAt"] = { $gte: startDate.toDate(), $lte: endDate.toDate() }
    }
    const leadIds = await devicesLotModel.distinct("deviceList", {
      status: "Pickup Confirmed",
    });
    const result = await leadModel.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $lookup: {
          from: "stores",
          localField: "user.storeId",
          foreignField: "_id",
          as: "store",
        },
      },
      {
        $unwind: "$store",
      },
      {
        $match: query1,
      },
      {
        $addFields: {
          price: { $add: ["$price", "$bonusPrice"] }, // Calculate sum of price and bonusPrice
        },
      },
      {
        $group: {
          _id: {
            createdAt: {
              $dateToString: { format: "%d/%m/%Y", date: "$createdAt" },
            },
            storeId: "$store._id",
            storeName: "$store.storeName",
            region: "$store.region",
          },
          leads: {
            $sum: {
              $cond: [{ $eq: ["$is_selled", true] }, 1, 0],
            },
          },
          completedLeads: {
            $sum: {
              $cond: [{ $in: ["$_id", leadIds] }, 1, 0],
            },
          },
          price: {
            $sum: {
              $cond: [{ $eq: ["$is_selled", true] }, "$price", 0],
            },
          },
          completedPrice: {
            $sum: {
              $cond: [{ $in: ["$_id", leadIds] }, "$price", 0],
            },
          },
          // price: { $sum: "$price" }
        },
      },
      {
        $sort: { "_id.createdAt": -1 },
      },
      {
        $group: {
          _id: "$_id.createdAt",
          totalAvailableForPickup: { $sum: "$leads" },
          priceOfferToCustomer: { $sum: "$price" },
          totalPicked: { $sum: "$completedLeads" },
          totalPickedPrice: { $sum: "$completedPrice" },
          data: {
            $push: {
              storeId: "$_id.storeId",
              storeName: "$_id.storeName",
              region: "$_id.region",
              availableForPickup: "$leads",
              price: "$price",
            },
          },
        },
      },
      {
        $match: query,
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          datenew: {
            $dateFromString: {
              dateString: "$_id",  // Convert the date string back to a Date object
              format: "%d/%m/%Y"   // Specify the format of the original date string
            }
          },
          totalAvailableForPickup: 1,
          priceOfferToCustomer: 1,
          totalPicked: 1,
          totalPickedPrice: 1,
          pendingForPickup: {
            $subtract: ["$totalAvailableForPickup", "$totalPicked"],
          },
          pendingForPickupPrice: {
            $subtract: ["$priceOfferToCustomer", "$totalPickedPrice"],
          },
          data: 1,
        },
      },
      {
        $sort: { datenew: -1 }
      }
    ]);
    const totalAvailableForPickup = await mapData(
      result,
      "totalAvailableForPickup"
    );
    const totalPriceOfferToCustomer = await mapData(
      result,
      "priceOfferToCustomer"
    );
    const totalPicked = await mapData(result, "totalPicked");
    const totalPickedPrice = await mapData(result, "totalPickedPrice");
    const totalPendingForPickup = await mapData(result, "pendingForPickup");
    const totalPendingForPickupPrice = await mapData(
      result,
      "pendingForPickupPrice"
    );
    const total = {
      totalAvailableForPickup,
      totalPriceOfferToCustomer,
      totalPicked,
      totalPickedPrice,
      totalPendingForPickup,
      totalPendingForPickupPrice,
    };
    return res.status(200).json({ total, result });
  } catch (error) {
    return res.status(500).json({ message: error.message, status: 500 });
  }
};

const mapData = (data, key) => {
  try {
    return data.map((item) => item[key]).reduce((acc, num) => acc + num, 0);
  } catch (error) {
    return 0;
  }
};

export default {
  create,
  update,
  deleteById,
  findById,
  findAll,
  uploadData,
  adminReport,
};
