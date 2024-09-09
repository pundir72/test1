import express from "express";
import gradePriceController from "../controller/gradePriceController.js";
import multer from "multer";

const gradePriceRoute = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

gradePriceRoute
    .post("/addEditModelsAndPrice", upload.single("file"), gradePriceController.addEditModelsAndPrice)
    .get("/modelPriceList", gradePriceController.modelPriceList)

export default gradePriceRoute;
