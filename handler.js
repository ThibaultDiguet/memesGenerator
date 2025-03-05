const AWS = require("aws-sdk");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const Busboy = require("busboy");
const streamifier = require("streamifier");

const isOffline = process.env.IS_OFFLINE;
const BUCKET_NAME = process.env.BUCKET_NAME;

const s3 = new AWS.S3(
  isOffline
    ? {
        s3ForcePathStyle: true,
        endpoint: "http://localhost:4569",
        accessKeyId: "S3RVER",
        secretAccessKey: "S3RVER",
      }
    : {}
);

exports.generateMeme = async (event) => {
  console.log("Requête reçue pour générer un meme...");

  const contentType = event.headers["content-type"] || event.headers["Content-Type"];
  const busboy = Busboy({ headers: { "content-type": contentType } });

  let topText, bottomText, imageBuffer;

  const parsePromise = new Promise((resolve, reject) => {
    busboy.on("field", (fieldname, val) => {
      if (fieldname === "topText") topText = val;
      if (fieldname === "bottomText") bottomText = val;
    });

    busboy.on("file", (fieldname, file) => {
      const chunks = [];
      file.on("data", (data) => chunks.push(data));
      file.on("end", () => {
        imageBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("finish", resolve);
    busboy.on("error", reject);

    const buffer = Buffer.from(event.body, "base64");
    streamifier.createReadStream(buffer).pipe(busboy);
  });

  await parsePromise;

  if (!imageBuffer) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Aucune image envoyée." }),
    };
  }

  const id = uuidv4();

  const createTextOverlay = (text) => `
    <svg width="500" height="100">
      <text x="50%" y="50%" font-size="40" fill="white" text-anchor="middle" dominant-baseline="middle">${text}</text>
    </svg>`;

  const memeBuffer = await sharp(imageBuffer)
    .composite([
      { input: Buffer.from(createTextOverlay(topText)), gravity: "north" },
      { input: Buffer.from(createTextOverlay(bottomText)), gravity: "south" },
    ])
    .toBuffer();

  const uploadToS3 = async (buffer, id) => {
    const params = {
      Bucket: BUCKET_NAME,
      Key: `${id}.png`,
      Body: buffer,
      ContentType: "image/png",
    };
    return s3.upload(params).promise();
  };

  console.log("Envoi du meme vers S3...");
  const s3UploadResponse = await uploadToS3(memeBuffer, id);

  console.log("Meme généré avec succès:", s3UploadResponse.Location);
  return {
    statusCode: 200,
    body: JSON.stringify({ id, url: s3UploadResponse.Location }),
  };
};
