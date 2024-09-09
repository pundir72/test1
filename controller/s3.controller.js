import pkg from "aws-sdk";
const { S3 } = pkg;
import fs from "fs";

const s3Bucket = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  // sessionToken: process.env.AWS_SESSION_TOKEN, // if applicable
  region: process.env.AWS_REGION,
});

// function for upload one file on s3 bucket
const acl = "public-read";
const uploadFile = async (file) => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      ContentType: file.mimetype,
      Key: `${file.originalname}`,
      Body: file.buffer,
      ACL: acl,
    };

    return new Promise((resolve, reject) => {
      s3Bucket.upload(params, async (err, data) => {
        if (err) {
          return reject({ err: err.message });
        }
        return resolve(data.Location);
      });
    });
  } catch (error) {
    console.log(error);
    return res.json({ error });
  }
};

// function for upload multiple files on s3 bucket
const uploadFiles = async (req, res) => {
  try {
    const files = req.files;
    for (const file of files) {
      const fileKey = file.originalname;
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        ContentType: file.mimetype,
        Key: fileKey,
        Body: file.buffer || (await fs.readFileSync(file.path)),
        ACL: acl,
      };

      return new Promise((resolve, reject) => {
        s3Bucket.upload(params, async (err, data) => {
          if (err) {
            return reject({ err: err.message });
          }
          return resolve(data.Location);
        });
      });
    }
    return res.json({ msg: "Data uploaded successfuly." });
  } catch (error) {
    return res.json({ error });
  }
};

const preSignedUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.query; // Get file name and file type from query params

    if (!fileName || !fileType) {
      return res
        .status(400)
        .json({ error: "File name and file type are required" });
    }
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      ContentType: fileType,
      Expires: 60000,
      Key: fileName,
    };
    const signedUrl = s3Bucket.getSignedUrl("putObject", params);
    console.log(signedUrl);
    return res.json({ url: signedUrl });
  } catch (error) {
    console.log(error);
    return res.json({ error });
  }
};

export default {
  preSignedUrl,
  uploadFile,
  uploadFiles,
};
