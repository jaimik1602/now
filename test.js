const axios = require("axios");

async function sendMessage() {
  const response = await axios.post(
    "https://whatsinfinity.com/api/send",
    {
      phone: "+" +"918511305416",
      message: "Hello John, how are you?",
      buttons: [
        { id: "id_1", title: "Fine" },
        { id: "id_2", title: "Not well" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer vdOBq2F0LlMWwO9MR4Bf8eudGcxSN5OohDmxt39P",
      },
      maxBodyLength: Infinity,
    }
  );

  console.log("Response:", JSON.stringify(response.data, null, 2));
}

sendMessage();
