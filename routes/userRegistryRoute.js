import express from "express";
import userRegistryController from "../controller/userRegistryController.js";
import verifyToken from "../middlewares/authJwt.js";

const userRegistryRoute = express.Router();

userRegistryRoute
  .get("/all",verifyToken, userRegistryController.userList)
  .get("/search",verifyToken, userRegistryController.userSearch)
  .post("/register", userRegistryController.createUser)
  .post("/updatePassword", verifyToken, userRegistryController.updatePassword)
  .put("/update", verifyToken, userRegistryController.editUser)
  .delete("/delete", verifyToken, userRegistryController.deleteUser);

export default userRegistryRoute;
