import gradeprice from "../models/gradePriceModel.js";
import csv from "../controller/questionnaireController.js";
import modelsModel from "../models/modelsModel.js";
import brandModel from "../models/brandsModel.js";
const warrantyType = "A+WARRANTY";

const findBrand = (brandName) => {
  return brandModel
    .findOne({ name: { $regex: brandName, $options: "i" } })
    .select("_id");
};


const parseModelDetails = (modelDetails) => {
  const mod = modelDetails.split("(");
  const finealMod = mod[0].trim();
  const store = mod[1].split("/");
  const storage = store[1].replace(")", "");
  return { finealMod, storage, RAM: store[0] };
};

const updateExistingModel = async (exists, series, storage, RAM, price) => {
  exists.series = series;
  const configExistsIndex = exists.config.findIndex(
    (c) => c.storage === storage && c.RAM === RAM
  );
  if (configExistsIndex !== -1) {
    exists.config[configExistsIndex].price = price;
  } else {
    exists.config.push({ storage, RAM, price });
  }
  await exists.save();
};

const createNewModel = (brandId, finealMod, storage, RAM, series, price) => {
  const obj = {
    brandId,
    name: finealMod,
    config: [{ storage, RAM, price }],
    series,
    type: "Mobile"
  };
  return modelsModel.create(obj);
};


const addEditModelsAndPrice = async (req, res) => {
  const cs = csv.convertCsvToJson(req.file);
  const rejected = [];
  let inserted = 0;
  let updated = 0;

  try {
    for (const a of cs) {
      const brand = await findBrand(a["Brand"]);
      if (brand) {
        const { finealMod, storage, RAM } = parseModelDetails(a["Model Details"]);
        const brandId = brand._id;
        const exists = await modelsModel.findOne({
          name: { $regex: `^${finealMod}$`, $options: "i" },
          brandId
        });

        if (exists) {
          await updateExistingModel(exists, a["Series"] || "", storage, RAM, a[warrantyType]);
          updatePrice(exists._id, a, storage, RAM);
          updated += 1;
          console.log(finealMod, "upd");
        } else {
          const insertedd = await createNewModel(brandId, finealMod, storage, RAM, a["Series"] || "", a[warrantyType]);
          updatePrice(insertedd._id, a, storage, RAM);
          inserted += 1;
          console.log(finealMod, "ins");
        }
      } else {
        rejected.push(a);
      }
    }
    res.status(200).json({
      data: [],
      rejected,
      message: `${inserted} Model and prices created, ${updated} updated, and ${rejected.length} rejected.`,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};


const updatePrice = async (modelId, data, storage, RAM) => {
  try {
    const query = {
      modelId,
      storage,
      $or: [
        { RAM: { $exists: false } }, // RAM field doesn't exist
        { RAM }, // RAM field exists and matches provided value
      ],
    };
    await gradeprice.findOneAndUpdate(
      query,
      {
        $set: {
          modelId,
          storage,
          grades: {
            A_PLUS: data[warrantyType],
            A: data["A"],
            B: data["B"],
            B_MINUS: data["B-"],
            C_PLUS: data["C+"],
            C: data["C"],
            C_MINUS: data["C-"],
            D_PLUS: data["D+"],
            D: data["D"],
            D_MINUS: data["D-"],
            E: data["E"],
          },
          RAM, // Add RAM field if provided
        },
      },
      { upsert: true }
    );
  } catch (error) {
    console.log(error);
  }
};

const modelPriceList = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 0;
    const query = {};
    const search = req.query.search;
    const deviceType = req.query.deviceType || "Mobile";
    if (search) {
      query["$or"] = [{ "model.name": { $regex: search, $options: "i" } }];
    }
    const aggregationPipeline = [
      {
        $lookup: {
          from: "models",
          localField: "modelId",
          foreignField: "_id",
          as: "model",
        },
      },
      { $unwind: "$model" },
      { $match: query },
      {
        $match: {
          "model.type": deviceType,
        },
      },
    ];
    const totalRecords = await gradeprice.aggregate([
      ...aggregationPipeline,
      {
        $count: "total",
      },
    ]);
    aggregationPipeline.push(
      {
        $sort: {
          updatedAt: -1,
        },
      },
      {
        $skip: page * limit,
      },
      {
        $limit: limit,
      }
    );
    const result = await gradeprice.aggregate(aggregationPipeline);
    res.status(200).json({ result, totalRecords: totalRecords[0]?.total || 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export default {
  addEditModelsAndPrice,
  modelPriceList,
};
