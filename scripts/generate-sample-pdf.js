const fs = require("fs");
const path = require("path");
const { once } = require("events");
const PDFDocument = require("pdfkit");

async function main() {
  const out = path.join(__dirname, "../public/samples/photosynthesis.pdf");
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(out);
  doc.pipe(stream);

  doc.fontSize(20).text("Introduction to Photosynthesis", { underline: true });
  doc.moveDown();
  doc
    .fontSize(12)
    .text(
      "Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy into chemical energy. It primarily occurs in chloroplasts, which contain the pigment chlorophyll."
    );
  doc.moveDown();
  doc.text("The overall equation is:");
  doc.text("Carbon dioxide + Water + Light energy -> Glucose + Oxygen");
  doc.moveDown();
  doc.text("There are two main stages:");
  doc.text(
    "1. Light-dependent reactions happen in the thylakoid membrane and produce ATP and NADPH while releasing oxygen."
  );
  doc.text(
    "2. The Calvin cycle (light-independent reactions) occurs in the stroma and uses ATP and NADPH to fix carbon dioxide into glucose."
  );
  doc.moveDown();
  doc.text(
    "Factors that affect the rate of photosynthesis include light intensity, carbon dioxide concentration, and temperature. When light intensity increases, the rate usually increases until another factor becomes limiting."
  );
  doc.moveDown();
  doc.text(
    "Why it matters: photosynthesis forms the base of most food chains and produces the oxygen that animals breathe."
  );

  doc.end();
  await once(stream, "finish");
  console.log("Wrote", out, `(${fs.statSync(out).size} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
