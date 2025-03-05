const AWS = require("aws-sdk");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const Busboy = require("busboy");
const streamifier = require("streamifier");
const fs = require("fs");
const path = require("path");

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

exports.getIndex = async (event) => {
  const indexPath = path.join(__dirname, "vues/index.html");
  const html = fs.readFileSync(indexPath, "utf8");

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html" },
    body: html,
  };
};

exports.listMemes = async (event) => {
  const params = { Bucket: BUCKET_NAME };
  try {
    const data = await s3.listObjectsV2(params).promise();
    const memesHtml = (data.Contents || []).map(item => {
      const url = isOffline
        ? `http://localhost:4569/${BUCKET_NAME}/${item.Key}`
        : s3.getSignedUrl("getObject", { Bucket: BUCKET_NAME, Key: item.Key, Expires: 3600 });
      return `<div style="margin-bottom: 20px;">
        <img src="${url}" alt="${item.Key}" style="max-width:300px;"/>
        <p>${item.Key}</p>
      </div>`;
    }).join('');
    const html = `
      <html>
        <head>
          <title>Liste des Mêmes</title>
          <style>
            body { font-family: Arial, sans-serif; padding:20px; }
            h1 { text-align: center; }
            div { margin: 10px; display: inline-block; vertical-align: top; }
            img { border: 1px solid #ddd; border-radius: 4px; padding: 5px; }
          </style>
        </head>
        <body>
          <h1>Liste des Mêmes Générés</h1>
          <a href="/dev">Générer un même</a>
          <div style="display:flex; flex-wrap:wrap;">
            ${memesHtml}
          </div>
        </body>
      </html>
    `;
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html
    };
  } catch (error) {
    console.error("Erreur en listant les mèmes", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur en listant les mèmes" })
    };
  }
};

exports.generateMeme = async (event) => {
  console.log("Requête reçue pour générer un meme...");

  const contentType = event.headers["content-type"] || event.headers["Content-Type"];
  const busboy = Busboy({ headers: { "content-type": contentType } });

  let topText, bottomText, topColor, bottomColor, imageBuffer;

  const parsePromise = new Promise((resolve, reject) => {
    busboy.on("field", (fieldname, val) => {
      if (fieldname === "topText") topText = val;
      if (fieldname === "bottomText") bottomText = val;
      if (fieldname === "topColor") topColor = val;
      if (fieldname === "bottomColor") bottomColor = val;
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

  const createTextOverlay = (text, color) => `
    <svg width="500" height="150">
      <text x="50%" y="50%" font-size="90" fill="${color || 'white'}" style="font-family: 'Poppins', sans-serif;" text-anchor="middle" dominant-baseline="middle">${text}</text>
    </svg>`;

  const memeBuffer = await sharp(imageBuffer)
    .composite([
      { input: Buffer.from(createTextOverlay(topText, topColor)), gravity: "north" },
      { input: Buffer.from(createTextOverlay(bottomText, bottomColor)), gravity: "south" },
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
