import mongoose from "mongoose";
import leads from "../models/leadsModel.js";
import { CORE2 } from "../const.js";
import condtionCodesWatch from "../models/conditionCodesWatchModel.js";
import phoneCondition from "../models/phoneConditon.js";
import gradeprices from "../models/gradePriceModel.js";
import leadLifecycle from "../models/LeadLifecycle.js";
import timeRangeCal from "../utils/timeRangeCal.js";

//grade list
const convertGrade = (grade) => {
  const grades = {
    "A+": "A_PLUS",
    A: "A",
    B: "B",
    "B-": "B_MINUS",
    "C+": "C_PLUS",
    C: "C",
    "C-": "C_MINUS",
    "D+": "D_PLUS",
    D: "D",
    "D-": "D_MINUS",
    E: "E",
  };
  return grades[grade];
};

const userDocPipe = [
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "userId",
    },
  },
  {
    $unwind: {
      path: "$userId",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $lookup: {
      from: "documents",
      localField: "documentId",
      foreignField: "_id",
      as: "documentId",
    },
  },
  {
    $unwind: {
      path: "$documentId",
      preserveNullAndEmptyArrays: true,
    },
  },
];

const modelStorePipe = [
  {
    $lookup: {
      from: "models",
      localField: "modelId",
      foreignField: "_id",
      as: "modelId",
    },
  },
  {
    $unwind: {
      path: "$modelId",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $lookup: {
      from: "stores",
      localField: "userId.storeId",
      foreignField: "_id",
      as: "store",
    },
  },
  {
    $unwind: {
      path: "$store",
      preserveNullAndEmptyArrays: true,
    },
  },
];

const findAll = async (req, res) => {
  try {
    const page = Number(req.query.page) || 0;
    const limit = Number(req.query.limit) || 10;
    const rid = req.query.rid || "";
    const customerPhone = req.query.customerPhone || "";
    const deviceType = req.query.deviceType || "Mobile";
    const {
      filter,
      customerId,
      grestRec,
      userId,
      is_selled,
      store,
    } = req.query;
    const { startDate, endDate } = timeRangeCal.timeRangeCal(
      filter,
      req.query.startDate,
      req.query.endDate
    );
    const query = {
      createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
    };
    if (is_selled) {
      query.is_selled = true;
    }

    if (customerId) {
      query._id = new mongoose.Types.ObjectId(customerId);
    }

    if (userId) {
      query.userId = new mongoose.Types.ObjectId(userId);
    }
    const aggregationPipeline = [
      {
        $match: query,
      },
      ...userDocPipe,
      ...modelStorePipe,
      {
        $lookup: {
          from: "deviceslots",
          localField: "_id",
          foreignField: "deviceList",
          as: "lotInfo",
        },
      },
      {
        $unwind: {
          path: "$lotInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          grestReceived: {
            $cond: [
              { $eq: ["$lotInfo.status", "Pickup Confirmed"] },
              "yes",
              "no",
            ],
          },
          grestRecDate: {
            $cond: [
              { $eq: ["$lotInfo.status", "Pickup Confirmed"] },
              "$lotInfo.updatedAt",
              null,
            ],
          },
        },
      },
    ];
    aggregationPipeline.push({
      $addFields: {
        price: { $add: ["$price", "$bonusPrice"] }, // Sum of price and bonusPrice
      },
    });
    aggregationPipeline.push({
      $match: {
        $or: [
          { "modelId.name": { $regex: rid, $options: "i" } },
          { uniqueCode: { $regex: rid, $options: "i" } },
          { "documentId.IMEI": { $regex: rid, $options: "i" } },
          { "userId.name": { $regex: rid, $options: "i" } },
          { "userId.firstName": { $regex: rid, $options: "i" } },
        ],
      },
    });

    aggregationPipeline.push({
      $match: {
        $or: [
          { name: { $regex: customerPhone, $options: "i" } },
          { phoneNumber: { $regex: customerPhone, $options: "i" } },
          { emailId: { $regex: customerPhone, $options: "i" } },
        ],
      },
    });

    aggregationPipeline.push({
      $match: {
        "modelId.type": deviceType,
      },
    });
    if (grestRec) {
      aggregationPipeline.push({
        $match: {
          grestReceived: grestRec,
        },
      });
    }
    if (store) {
      aggregationPipeline.push({
        $match: {
          "userId.storeId": new mongoose.Types.ObjectId(store),
        },
      });
    }
    const count = [
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      },
    ];
    const result = await leads.aggregate([...aggregationPipeline, ...count]);
    const totalCounts = result.length ? result[0].count : 0;
    aggregationPipeline.push(
      {
        $sort: { updatedAt: -1 },
      },
      {
        $skip: page * limit,
      },
      {
        $limit: limit,
      }
    );
    const data = await leads.aggregate(aggregationPipeline);
    res.status(200).json({
      data,
      totalCounts,
      message: "questionnaires fetched successfully.",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

const findAllSelled = async (req, res) => {
  req.query.is_selled = true;
  await findAll(req, res);
};

//this api for calculate price from admin panel
function checkKeysValidity(keys, adminAnswer) {
  let error = false;
  keys.forEach((key) => {
    if (!adminAnswer.hasOwnProperty(key) || adminAnswer[key] === "") {
      console.error(`Missing or empty key: ${key}`);
      error = true;
    }
  });
  return error;
}

const calculatePriceAdminWatch = async (req, res) => {
  const { adminAnswer } = req.body;
  const keys = [
    "MobileID",
    "Warranty",
    "Accessories",
    "Functional",
    "Physical",
  ];

  if (checkKeysValidity(keys, adminAnswer)) {
    return res.status(403).json({
      success: false,
      message: "QNA, modelId are required",
    });
  }

  const modelID = adminAnswer?.MobileID;
  const query = {
    warrentyCode: adminAnswer?.Warranty,
    accessoriesCode: adminAnswer?.Accessories,
    functionalCode: adminAnswer?.Functional,
    cosmeticsCode: adminAnswer?.Physical,
  };

  const gradeData = await condtionCodesWatch.findOne(query).select("grade");
  const priceData = await gradeprices
    .findOne({ modelId: modelID })
    .select("grades");
  const price = priceData.grades[convertGrade(gradeData.grade)];
  return res.status(200).json({
    data: { price, grade: gradeData.grade },
    message: "price fetched successfully.",
  });
};

const calculatePriceAdmin = async (req, res) => {
  try {
    const { adminAnswer } = req.body;
    const deviceType = req.body.deviceType || "Mobile";

    if (deviceType === "Watch") {
      return await calculatePriceAdminWatch(req, res);
    }
    const keys = [
      "MobileID",
      "storage",
      "Warranty",
      "Core",
      "Display",
      "Functional_major",
      "Functional_minor",
      "Cosmetics",
    ];

    if (checkKeysValidity(keys, adminAnswer)) {
      return res.status(403).json({
        success: false,
        message: "QNA, modelId are required",
      });
    }

    const modelId = adminAnswer?.MobileID;
    const storage = adminAnswer?.storage;
    const RAM = adminAnswer?.ram;

    const query = {
      coreCode: adminAnswer?.Core,
      warrentyCode: adminAnswer?.Warranty,
      displayCode: adminAnswer?.Display,
      functionalMajorCode: adminAnswer?.Functional_major,
      functionalMinorCode: adminAnswer?.Functional_minor,
      cosmeticsCode: adminAnswer?.Cosmetics,
    };

    const gradeData =
      query?.coreCode !== CORE2
        ? await phoneCondition.findOne(query).select("grade")
        : { grade: "E" };
    console.log(gradeData);

    const priceData = await gradeprices
      .findOne({ modelId, storage, RAM })
      .select("grades");

    const price =
      query?.coreCode === CORE2
        ? priceData.grades["E"]
        : priceData.grades[convertGrade(gradeData.grade)];

    return res.status(200).json({
      data: { price, grade: gradeData.grade },
      message: "price fetched successfully.",
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

const orderPipe = [
  {
    $lookup: {
      from: "users",
      localField: "userid",
      foreignField: "_id",
      as: "user",
    },
  },
  { $unwind: "$user" },
  {
    $lookup: {
      from: "leads",
      localField: "lead_id",
      foreignField: "_id",
      as: "lead",
    },
  },
  { $unwind: "$lead" },
  { $match: { "lead.is_selled": false } },
  {
    $lookup: {
      from: "models",
      localField: "lead.modelId",
      foreignField: "_id",
      as: "lead.model",
    },
  },
  { $unwind: "$lead.model" },
];

async function orderCreated(req, res) {
  const { time, search, fromdate, todate, store } = req.query;
  const { startDate, endDate } = timeRangeCal.timeRangeCal(
    time,
    fromdate,
    todate
  );
  try {
    const aggregationPipeline = [...orderPipe, { $sort: { createdAt: -1 } }];
    if (search) {
      aggregationPipeline.push({
        $match: {
          $or: [
            { "lead.model.name": { $regex: search, $options: "i" } },
            { "lead.uniqueCode": { $regex: search, $options: "i" } },
            { "lead.name": { $regex: search, $options: "i" } },
            { "lead.phoneNumber": { $regex: search, $options: "i" } },
            { "lead.uniqueCode": { $regex: search, $options: "i" } },
            { "user.name": { $regex: search, $options: "i" } },
          ],
        },
      });
    }
    aggregationPipeline.push({
      $addFields: {
        "lead.price": { $add: ["$lead.price", "$lead.bonusPrice"] }, // Sum of price and bonusPrice
      },
    });
    if (store) {
      const storeId = new mongoose.Types.ObjectId(store);

      aggregationPipeline.push({
        $match: {
          "user.storeId": storeId,
        },
      });
    }
    const query = [
      {
        $match: {
          eventType: "orderCreated",
          updatedAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        },
      },
    ];

    const orders = await leadLifecycle.aggregate([
      ...query,
      ...aggregationPipeline,
    ]);

    const data = {
      orderData: {
        count: orders.length,
        data: orders,
      },
    };

    res.status(200).json({ code: 200, data });
  } catch (err) {
    res
      .status(500)
      .json({ code: 500, message: "An error occurred", error: err.toString() });
  }
}

//quote cretaed

async function QuoteCreated(req, res) {
  const search = req.query.search || "";
  const { time, fromdate, todate, store } = req.query;
  const { startDate, endDate } = timeRangeCal.timeRangeCal(
    time,
    fromdate,
    todate
  );
  const match = {
    eventType: "quoteCreated",
    updatedAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
  };
  try {
    const aggregationPipeline = [...orderPipe, { $sort: { createdAt: -1 } }];

    if (store) {
      const storeId = new mongoose.Types.ObjectId(store);
      aggregationPipeline.push({
        $match: {
          "user.storeId": storeId,
        },
      });
    }


    if (search) {

      aggregationPipeline.push({

        $match: {
          $or: [
            { "lead.model.name": { $regex: search, $options: "i" } },
            { "lead.phoneNumber": { $regex: search, $options: "i" } },
            { "lead.emailId": { $regex: search, $options: "i" } },
            { "user.firstName": { $regex: search, $options: "i" } },
            { "lead.uniqueCode": { $regex: search, $options: "i" } },
            { "lead.name": { $regex: search, $options: "i" } },
            { "user.name": { $regex: search, $options: "i" } }
          ],
        },
      });
    }
    const query = [{ $match: match }];
    const quotes = await leadLifecycle.aggregate([
      ...query,
      ...aggregationPipeline,
    ]);

    const data = {
      quoteData: {
        count: quotes.length,
        data: quotes,
      },
    };

    res.status(200).json({ code: 200, data });
  } catch (err) {
    res
      .status(500)
      .json({ code: 500, message: "An error occurred", error: err.toString() });
  }
}

export default {
  findAll,
  findAllSelled,
  calculatePriceAdmin,
  orderCreated,
  QuoteCreated,
  orderPipe,
};
