import express from "express";
import leadsController from "../controller/leadsController.js";
import verifyToken from "../middlewares/authJwt.js"

const leadsRoute = express.Router();

leadsRoute
    .get("/findAll",verifyToken, leadsController.findAll)
    .get("/findAllSelled", verifyToken, leadsController.findAllSelled)
    .get("/findAll/ordercreated", verifyToken, leadsController.orderCreated)
    .get("/findAll/quotecreated", verifyToken, leadsController.QuoteCreated)
    .post("/Admincalculate", verifyToken, leadsController.calculatePriceAdmin)

export default leadsRoute;
