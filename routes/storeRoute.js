import express from "express";
import storeController from "../controller/storeController.js";
import verifyToken from "../middlewares/authJwt.js";
import multer from "multer";
const upload = multer({ storage: multer.memoryStorage() });
const storeRoute = express.Router();

storeRoute
    .post("/create", verifyToken, storeController.create)
    .put("/edit", verifyToken, storeController.update)
    .delete("/deleteById", verifyToken, storeController.deleteById)
    .get("/findById", verifyToken, storeController.findById)
    .get("/findAll", verifyToken, storeController.findAll)
    .post("/uploadStores", upload.single("file"), verifyToken, storeController.uploadData)
    .get("/adminReport", storeController.adminReport);

export default storeRoute;
