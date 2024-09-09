import questionnaire from "../models/questionnaireModel.js";
import leads from "../models/leadsModel.js";
import models from "../models/modelsModel.js";
import gradeprices from "../models/gradePriceModel.js";
import phoneCondition from "../models/phoneConditon.js";
import documents from "../models/documents.model.js";
import XLSX from "xlsx";
import {
  CORE1,
  CORE2,
  DISPLAY1,
  DISPLAY2,
  DISPLAY3,
  FUNCTIONAL_MAJOR1,
  FUNCTIONAL_MAJOR2,
  FUNCTIONAL_MAJOR3,
  FUNCTIONAL_MINOR1,
  FUNCTIONAL_MINOR2,
  FUNCTIONAL_MINOR3,
  COSMETICS1,
  COSMETICS2,
  COSMETICS3,
  COSMETICS4,
  WARRANTY1,
  WARRANTY2,
  FUNCTIONAL_MAJOR1_1,
  ACCESSORIES1,
  ACCESSORIES2,
  ACCESSORIES3,
} from "../const.js";
import s3Controller from "./s3.controller.js";
import condtionCodesWatch from "../models/conditionCodesWatchModel.js";

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

const create = async (req, res) => {
  try {
    const { group, yes, no, quetion } = req.body;
    if (!group || !yes || !no || !quetion || !req.body.default) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const data = await questionnaire.create(req.body);
    return res
      .status(200)
      .json({ data, message: "questionnaires created successfully." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};

const insertMany = async (req, res) => {
  const cs = convertCsvToJson(req.file);
  try {
    const data = await questionnaire.insertMany(cs);
    res
      .status(200)
      .json({ data, message: "questionnaires created successfully." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

const findAll = async (req, res) => {
  try {
    const page = Number(req.query.page) || 0;
    const deviceType = req.query.type || "Mobile";
    const limit = 50;
    const data = await questionnaire
      .find({ type: deviceType })
      .limit(limit)
      .skip(page * limit)
      .sort({ viewOn: 1 });
    const totalCounts = await questionnaire.countDocuments({
      type: deviceType,
    });
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

function DisplayCodeUpd(QNA, query) {
  let display = QNA?.Display
    ? QNA.Display.filter((e) => e.answer === DISPLAY3)
    : [];
  query.displayCode = DISPLAY3;
  if (!display.length) {
    display = QNA.Display.filter((e) => e.answer === DISPLAY2);
    query.displayCode = DISPLAY2;
    if (!display.length) {
      QNA.Display.filter((e) => e.answer === DISPLAY1);
      query.displayCode = DISPLAY1;
    }
  }
}

function FuncMajorUpd(QNA, query) {
  let functionalMajor = QNA?.Functional_major
    ? QNA.Functional_major.filter((e) => e.answer === FUNCTIONAL_MAJOR3)
    : [];
  query.functionalMajorCode = FUNCTIONAL_MAJOR3;
  if (!functionalMajor.length) {
    functionalMajor = QNA.Functional_major.filter(
      (e) => e.answer === FUNCTIONAL_MAJOR2
    );
    query.functionalMajorCode = FUNCTIONAL_MAJOR2;
    if (!functionalMajor.length) {
      QNA.Functional_major.filter((e) => e.answer === FUNCTIONAL_MAJOR1);
      query.functionalMajorCode = FUNCTIONAL_MAJOR1;
    }
  }
}

function FuncMinorUpd(QNA, query) {
  let functionalMinor = QNA?.Functional_minor
    ? QNA.Functional_minor.filter((e) => e.answer === FUNCTIONAL_MINOR3)
    : [];
  query.functionalMinorCode = FUNCTIONAL_MINOR3;
  if (!functionalMinor.length) {
    functionalMinor = QNA.Functional_minor.filter(
      (e) => e.answer === FUNCTIONAL_MINOR2
    );
    query.functionalMinorCode = FUNCTIONAL_MINOR2;
    if (!functionalMinor.length) {
      QNA.Functional_minor.filter((e) => e.answer === FUNCTIONAL_MINOR1);
      query.functionalMinorCode = FUNCTIONAL_MINOR1;
    }
  }
}

function CosmeticsUpd(QNA, query) {
  let cosmetics = QNA?.Cosmetics
    ? QNA.Cosmetics.filter((e) => e.answer === COSMETICS4)
    : [];
  query.cosmeticsCode = COSMETICS4;
  if (!cosmetics.length) {
    cosmetics = QNA.Cosmetics.filter((e) => e.answer === COSMETICS3);
    query.cosmeticsCode = COSMETICS3;
    if (!cosmetics.length) {
      cosmetics = QNA.Cosmetics.filter((e) => e.answer === COSMETICS2);
      query.cosmeticsCode = COSMETICS2;
      if (!cosmetics.length) {
        QNA.Cosmetics.filter((e) => e.answer === COSMETICS1);
        query.cosmeticsCode = COSMETICS1;
      }
    }
  }
}

const calculatePrice = async (req, res) => {
  try {
    const { QNA, phoneNumber, modelId, storage, name, ram } = req.body;
    const query = { coreCode: CORE1 };
    if (!QNA || !phoneNumber || !modelId || !storage || !ram) {
      return res.status(403).json({
        success: false,
        message: "QNA, phone number,storage,ram and modelId are required",
      });
    }

    const core = QNA.Core.filter((e) => e.answer === CORE2);

    const warranty = QNA?.Warranty
      ? QNA.Warranty.filter((e) => e.answer === WARRANTY1)
      : [];
    query.warrentyCode = warranty.length ? WARRANTY1 : WARRANTY2;

    DisplayCodeUpd(QNA, query);
    FuncMajorUpd(QNA, query);
    FuncMinorUpd(QNA, query);
    CosmeticsUpd(QNA, query);

    //settig uniquew code
    const gradeData = await phoneCondition.findOne(query).select("grade");
    const priceData = await gradeprices
      .findOne({ modelId, storage, RAM: ram })
      .select("grades");
    const price = core.length
      ? priceData.grades["E"]
      : priceData.grades[convertGrade(gradeData.grade)];
    const actualPrice = price;
    const modelData = await models.findOne({ _id: modelId }).select("brandId");
    const queryParam = {
      phoneNumber,
      modelId,
      userId: req.userId,
      storage,
      ram,
      is_selled: false,
    };
    const obj = {
      QNA,
      phoneNumber,
      name,
      modelId,
      brandId: modelData.brandId,
      userId: req.userId,
      price,
      storage,
      ram,
      gradeId: gradeData._id,
      actualPrice,
      uniqueCode: "GRCTB100",
    };
    const { lead, uniqueCode } = await generateLeadAndUpdateOrCreate(
      req,
      obj,
      queryParam
    );
    return res.status(200).json({
      data: {
        id: lead._id,
        price: Number(price),
        grade: gradeData.grade,
        uniqueCode,
      },
      message: "price fetched successfully.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};

const convertCsvToJson = (file) => {
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  var sheetNameList = workbook.SheetNames;
  const options = { defval: "" };
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetNameList[0]], options);
};

const itemPurchased = async (req, res) => {
  try {
    const lead = await leads
      .findOne({ userId: req.userId, _id: req.body.id })
      .populate("modelId");
    if (!lead) {
      return res.status(400).json({
        success: false,
        message: "Invalid user or id",
      });
    }
    if (lead.is_selled) {
      return res.status(200).json({
        success: true,
        message: "Item sold out",
        data: lead,
      });
    }
    lead.bonusPrice = Number(req.body.bonusPrice);
    if (req.file) {
      lead.reciept = await s3Controller.uploadFile(req.file);
    }
    lead.is_selled = true;
    await leads.findByIdAndUpdate({ _id: lead._id }, lead);
    return res.status(200).json({
      data: lead.modelId,
      id: lead._id,
      message: "Item Sold Successfully.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};

const getSubmitedData = async (req, res) => {
  try {
    let lead = await leads
      .findOne({ userId: req.userId, _id: req.body.id })
      .populate("modelId");
    if (lead.gradeId) {
      lead = await leads
        .findOne({ userId: req.userId, _id: req.body.id })
        .populate("modelId")
        .populate("gradeId");
    }
    return res
      .status(200)
      .json({ data: lead, message: "Item Fetched Successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const uploadDocuments = async (req, res) => {
  try {
    const {
      adharFront,
      adharBack,
      phoneBill,
      phoneFront,
      phoneBack,
      phoneUp,
      phoneDown,
      phoneLeft,
      phoneRight,
      signature,
    } = req.files;
    const { IMEI, leadId, emailId, name, phoneNumber } = req.body;

    const obj = {
      IMEI: IMEI ? IMEI : "",
      adhar: {
        front: adharFront ? await s3Controller.uploadFile(adharFront[0]) : "",
        back: adharBack ? await s3Controller.uploadFile(adharBack[0]) : "",
      },
      phoneBill: phoneBill ? await s3Controller.uploadFile(phoneBill[0]) : "",
      phonePhotos: {
        front: phoneFront ? await s3Controller.uploadFile(phoneFront[0]) : "",
        back: phoneBack ? await s3Controller.uploadFile(phoneBack[0]) : "",
        up: phoneUp ? await s3Controller.uploadFile(phoneUp[0]) : "",
        down: phoneDown ? await s3Controller.uploadFile(phoneDown[0]) : "",
        left: phoneLeft ? await s3Controller.uploadFile(phoneLeft[0]) : "",
        right: phoneRight ? await s3Controller.uploadFile(phoneRight[0]) : "",
      },
      signature: signature ? await s3Controller.uploadFile(signature[0]) : "",
      userId: req.userId,
      leadId: leadId,
    };
    const data = await documents.create(obj);
    const lead = await leads.findOne({ _id: leadId }).select("gradeId");
    const gradeId = lead.gradeId;
    const toUpdate = { documentId: data._id, gradeId };
    if (emailId) {
      toUpdate.emailId = emailId;
    }
    if (name) {
      toUpdate.name = name;
    }
    if (phoneNumber) {
      toUpdate.phoneNumber = phoneNumber;
    }
    await leads.findByIdAndUpdate({ _id: leadId }, toUpdate);
    return res
      .status(200)
      .json({ data, message: "Documents uploaded successfully." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};

const getDocuments = async (req, res) => {
  try {
    const page = Number(req.query.page) || 0;
    const limit = Number(req.query.limit) || 10;
    const data = await documents
      .find({})
      .populate("userId")
      .populate("leadId")
      .limit(limit)
      .skip(page * limit)
      .sort({ createdAt: -1 });
    const totalCounts = await documents.countDocuments({});
    res
      .status(200)
      .json({ data, totalCounts, message: "documents fetched successfully." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

const questionnaireList = async (req, res) => {
  const deviceType = req.query.deviceType || "Mobile";

  try {
    const data = await questionnaire.aggregate([
      {
        $match: {
          type: deviceType,
        },
      },
      {
        $group: {
          _id: "$group",
          data: { $push: "$$ROOT" }, // Keep all fields in the array
        },
      },
    ]);
    res
      .status(200)
      .json({ data, message: "questionnaire List fetched successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const { id, group, yes, no, quetion } = req.body;
    if (!id || !group || !yes || !no || !quetion || !req.body.default) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const result = await questionnaire.findByIdAndUpdate(
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
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ message: "id is required" });
    }
    const result = await questionnaire.findByIdAndDelete(id);
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ message: error.message, status: 500 });
  }
};

function FunctionalUpd(QNA, query) {
  const functional = QNA?.Functional
    ? QNA.Functional.filter((e) => e.answer === FUNCTIONAL_MAJOR1)
    : [];
  query.functionalCode = FUNCTIONAL_MAJOR1;
  if (!functional.length) {
    query.functionalCode = FUNCTIONAL_MAJOR1_1;
  }
}

function PhysicalUpd(QNA, query) {
  let physical = QNA?.Physical
    ? QNA.Physical.filter((e) => e.answer === COSMETICS4)
    : [];
  query.cosmeticsCode = COSMETICS4;
  if (!physical.length) {
    physical = QNA.Physical.filter((e) => e.answer === COSMETICS3);
    query.cosmeticsCode = COSMETICS3;
    if (!physical.length) {
      physical = QNA.Physical.filter((e) => e.answer === COSMETICS2);
      query.cosmeticsCode = COSMETICS2;
      if (!physical.length) {
        query.cosmeticsCode = COSMETICS1;
      }
    }
  }
}

function AccessoriesUpd(QNA, query) {
  const accessories = QNA?.Accessories
    ? QNA.Accessories.filter((e) => e.answer === ACCESSORIES3)
    : [];
  query.accessoriesCode = ACCESSORIES3;

  if (!accessories.length || accessories.length !== QNA?.Accessories.length) {
    const strap = QNA.Accessories.filter(
      (e) => e.quetion === "Strap available"
    );
    const charger = QNA.Accessories.filter(
      (e) => e.quetion === "Charger available"
    );
    if (strap[0].answer === ACCESSORIES2) {
      query.accessoriesCode = ACCESSORIES2;
    }
    if (charger[0].answer === ACCESSORIES1) {
      query.accessoriesCode = ACCESSORIES1;
    }
  }
}

//calcuatle the watch prce
const calculatePriceWatch = async (req, res) => {
  try {
    const { QNA, modelId, name, phoneNumber } = req.body;
    const query = {};
    if (!QNA || !modelId) {
      return res.status(403).json({
        success: false,
        message: "QNA and modelId are required",
      });
    }

    const warranty = QNA?.Warranty
      ? QNA.Warranty.filter((e) => e.answer === WARRANTY1)
      : [];
    query.warrentyCode = warranty.length ? WARRANTY1 : WARRANTY2;

    FunctionalUpd(QNA, query);
    PhysicalUpd(QNA, query);
    AccessoriesUpd(QNA, query);
    //settig uniquew code
    const gradeData = await condtionCodesWatch.findOne(query).select("grade");
    const priceData = await gradeprices.findOne({ modelId }).select("grades");

    const price = priceData.grades[convertGrade(gradeData.grade)];
    const actualPrice = price;
    const modelData = await models.findOne({ _id: modelId });
    const queryParam = {
      phoneNumber,
      modelId,
      userId: req.userId,
      is_selled: false,
    };
    const obj = {
      QNA,
      modelId,
      brandId: modelData.brandId,
      userId: req.userId,
      price,
      gradeId: gradeData._id,
      actualPrice,
      uniqueCode: "GRCTB100",
      ram: modelData.config[0].RAM,
      phoneNumber,
      name,
    };
    const { lead, uniqueCode } = await generateLeadAndUpdateOrCreate(
      req,
      obj,
      queryParam
    );
    return res.status(200).json({
      data: {
        id: lead._id,
        price: Number(price),
        grade: gradeData.grade,
        uniqueCode,
      },
      message: "price fetched successfully.",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};

async function generateLeadAndUpdateOrCreate(req, obj, queryParam) {
  let lead;
  const doc = await leads.findOne(queryParam).select("uniqueCode");
  const lastDoc = await leads
    .findOne({ userId: req.userId, uniqueCode: { $ne: "" } })
    .sort({ createdAt: -1 });
  const inputString = req?.storeName || "Switchkart";
  const words = inputString?.split(" ");
  const firstCharacters = words.map((word) => word.charAt(0));
  const resultString = firstCharacters.join("");
  if (lastDoc) {
    const numbersArray = lastDoc.uniqueCode.match(/\d+/g);
    const code = numbersArray ? numbersArray.map(Number) : [];
    obj.uniqueCode = `GRCTB${resultString}${Number(code) + 1}`;
  }

  if (doc) {
    obj.uniqueCode = doc.uniqueCode;
    lead = await leads.findByIdAndUpdate({ _id: doc._id }, obj);
  } else {
    console.log(obj);
    obj.bonusPrice = 0;
    lead = await leads.create(obj);
  }
  return { lead, uniqueCode: obj.uniqueCode };
}

export default {
  insertMany,
  create,
  findAll,
  calculatePrice,
  itemPurchased,
  convertCsvToJson,
  uploadDocuments,
  getSubmitedData,
  getDocuments,
  questionnaireList,
  update,
  deleteById,
  calculatePriceWatch,
};
