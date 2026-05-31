import { stripe } from "./api/stripe";
import fs from "fs";
import path from "path";

(async () => {
  const PATH =
    "/Users/marcusklein/dev/regroup-functions/functions/src/assets/app-icon.png";

  const image = fs.readFileSync(PATH);

  console.log(image);

  const icon = await stripe.files.create({
    file: {
      data: image,
      name: "icon.png",
      type: "application.octet-stream",
    },
    purpose: "business_icon",
  });

  console.log(icon.id);
})();
