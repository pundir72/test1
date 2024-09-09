import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: "propertyp247@gmail.com",
        pass: process.env.MAIL_PASS,
    },
});

export default mailTransporter;
