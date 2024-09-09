import userRegistry from "../models/UsersModel.js";
import bcrypt from "bcryptjs";
import transporter from "../utils/mailTransporter.js";

const ISE = "Internal Server Error";

const roleSaleUser = "Sale User";
const roleTechnician = "Technician";
const roleAdminManager = "Admin Manager";
const userList = async (req, res) => {
  let users;
  try {
    users = await userRegistry.aggregate([
      { $match: { role: { $in: [roleSaleUser, roleTechnician, roleAdminManager]}}},
      {
        $lookup: {
          from: "stores", // The name of the store collection
          localField: "storeId",
          foreignField: "_id",
          as: "stores",
        },
      },
      {
        $unwind: { path: "$stores", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "companies", // The name of the store collection
          localField: "companyId",
          foreignField: "_id",
          as: "companyData",
        },
      },
      {
        $unwind: { path: "$companyData", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          companyName: "$companyData.companyName",
        },
      },
      {
        $project: {
          password: 0,
          companyData: 0,
        },
      },
      {
        $sort: { updatedAt: -1 },
      },
    ]);
  } catch (err) {
    return res
      .status(500)
      .json({ msg: "Fetching users failed, please try again later." });
  }
  return res
    .status(200)
    .json({ data: users, msg: "Successfully fetched all users" });
};

const updatePassword = async (req, res) => {
  const email = req.body.email;
  let newPassword = req.body.newPassword;
  const oldPassword = req.body.oldPassword;

  let existingUser;
  try {
    existingUser = await userRegistry.findOne({ email: email });
    if (!existingUser) {
      return res.status(422).json({ msg: "User does not exist" });
    }

    const verifyPassword = await bcrypt.compare(
      oldPassword,
      existingUser.password
    );

    if (!verifyPassword) {
      return res.status(400).json({ msg: "Incorrect Password" });
    }

    if (newPassword && newPassword.length >= 8) {
      newPassword = await bcrypt.hash(newPassword, 5);
    } else {
      return res.status(500).json({ msg: "password size is very too small" });
    }
    const updatedUser = await userRegistry.findByIdAndUpdate(existingUser._id, {
      password: newPassword,
    });
    if (!updatedUser) {
      return res.status(404).json({ msg: "User not found" });
    }
    return res.status(200).json({ msg: "Successfully updated user password " });
  } catch (error) {
    return res.status(500).json({ msg: ISE });
  }
};

const userSearch = async (req, res) => {
  const uid = req.query.uid || ""; // Default value is an empty string if rid is undefined
  const role = req.query.role || "";
  const storeName = req.query.storeName || "";
  let usersList;
  try {
    usersList = await userRegistry.aggregate([
      { $match: { role: { $in: [roleSaleUser, roleTechnician, roleAdminManager]}}},
      {
        $addFields: {
          tempUserId: { $toString: "$_id" },
        },
      },
      {
        $lookup: {
          as: "stores",
          from: "stores",
          foreignField: "_id",
          localField: "storeId",
        },
      },
      {
        $unwind: { path: "$stores", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "companies", // The name of the store collection
          localField: "companyId",
          foreignField: "_id",
          as: "companyData",
        },
      },
      {
        $unwind: { path: "$companyData", preserveNullAndEmptyArrays: true },
      },
      {
        $addFields: {
          companyName: "$companyData.companyName",
        },
      },
      {
        $match: {
          $and: [
            {
              $or: [
                { tempUserId: { $regex: uid, $options: "i" } },
                { firstName: { $regex: uid, $options: "i" } },
                { lastName: { $regex: uid, $options: "i" } },
                { name: { $regex: uid, $options: "i" } },
                { phoneNumber: { $regex: uid, $options: "i" } },
                { email: { $regex: uid, $options: "i" } },
              ],
            },
            { role: { $regex: role, $options: "i" } },
            { "stores.storeName": { $regex: storeName, $options: "i" } },
          ],
        },
      },
      { $sort: { updatedAt: -1 } },
      {
        $project: {
          password: 0, // Exclude the password field
          companyData: 0,
        },
      },
    ]);
  } catch (error) {
    return res.status(500).json({ msg: ISE });
  }
  return res
    .status(200)
    .json({ data: usersList, msg: "Successfully searched data" });
};

const createUser = async (req, res) => {
  const userDetail = req.body;

  let existingUser;
  try {
    const {
      storeId,
      email,
      password,
      role,
      phoneNumber,
    } = req.body;
    if (
      !storeId ||
      !email ||
      !password ||
      !role ||
      !phoneNumber
    ) {
      return res
        .status(422)
        .json({
          msg: "storeId, email, password, role, and phoneNumber are required",
        });
    }
    if (role !== roleAdminManager && role !== roleTechnician && role !== roleSaleUser) {
      return res.status(422).json({msg: "Cannot Assign This Role Out of Scope"});
    }
    existingUser = await userRegistry.findOne({ email: userDetail.email });

    if (existingUser) {
      return res
        .status(422)
        .json({ msg: "User exists already, please login instead." });
    }

    let hashedPassword;
    if (userDetail.password && userDetail.password.length >= 6) {
      hashedPassword = await bcrypt.hash(userDetail.password, 5);
    } else {
      return res.status(500).json({ msg: "Password size is very too small" });
    }

    await userRegistry.create({
      firstName: userDetail.firstName,
      lastName: userDetail.lastName,
      name: `${userDetail.firstName ? userDetail.firstName : ""} ${
        userDetail.lastName ? userDetail.lastName : ""
      }`,
      email: userDetail.email,
      password: hashedPassword,
      phoneNumber: userDetail.phoneNumber.toString(),
      grestMember: false,
      role: userDetail.role,
      address: userDetail.address,
      city: userDetail.city,
      storeId: storeId,
      companyId: "660bdd6e9f08331a55342ba5",
    });
  let Message = `
    <div
      style="max-width: 90%; margin: auto; padding-top: 20px;"
    >
      <br/>
      <span style="font-weight:500; display:block;">Dear - ${userDetail.firstName}</span>
      <span style="font-weight:500; display:block;">Your password for Grest is ${userDetail.password}</span>
    </div>
  `;
    await transporter.sendMail({
      from: "jayant@365aitech.com",
      to: [userDetail.email],
      subject: "Successfully Registered",
      html: Message,
    });
    console.log("email sent successfully");
    return res.status(200).json({ msg: "User registered successfully." });
  } catch (err) {
    return res
      .status(500)
      .json({ msg: "User registration failed, please try again." });
  }
};

const editUser = async (req, res) => {
  const updateData = req.body;
  const userID = req.body.userID;

  delete updateData.password;
  delete updateData._id;
  delete updateData.companyId;
  if (updateData.role !== roleAdminManager && updateData.role !== roleTechnician && updateData.role !== roleSaleUser) {
    return res.status(422).json({msg: "Cannot Assign This Role Out of Scope"});
  }
  let updatedUser;
  try {
    updatedUser = await userRegistry.findByIdAndUpdate(userID, updateData);
    if (!updatedUser) {
      return res
        .status(404)
        .json({ msg: "User not found, failed to update data" });
    }
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({ msg: ISE });
  }
  return res
    .status(200)
    .json({ data: updatedUser, msg: "Successfully updated user data" });
};

const deleteUser = async (req, res) => {
  const { userID } = req.body;
  const modfierId = req.userId;

  try {
    const adminData = await userRegistry.findById(modfierId);
    if (!!adminData) {
      if (adminData.role !== "Super Admin" && adminData.role !== roleAdminManager) {
        return res
          .status(403)
          .json({
            msg: "Unauthorized: You do not have permission to delete a user.",
          });
      }
    } else {
      return res
        .status(403)
        .json({
          msg: "Unauthorized: Your account information could not be verified.",
        });
    }

    await userRegistry.findByIdAndDelete(userID);
  } catch (error) {
    return res
      .status(500)
      .json({ msg: "Failed to delete user, please try again." });
  }
  return res.status(200).json({ message: "User deleted successfully" });
};

export default {
  userList,
  updatePassword,
  userSearch,
  createUser,
  editUser,
  deleteUser,
};
