const axios = require("axios");

async function sendMessage() {
  const response = await axios.post(
    "https://whatsinfinity.com/api/send",
    {
      phone: "+" + "918511305416",
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
  await axios.post(
    "https://graph.facebook.com/v21.0/469434999592396/messages",
    {
      messaging_product: "whatsapp",
      to: "918511305416",
      text: { body: "text" },
      language: { code: "en_US" },
    },
    { headers: { Authorization: `Bearer EAAZAZCxUCCBOwBO3F9WfloAXENismkpNWB1bQEXZAr4rDnNBNPksYANMmnOiG18tu7VClZCDhhgptJogXafElFpz5GNLJHmZARy5ngHrCBR7zKSwfvZAqu4oKEIDTwNQ0YvlsLqXurYQIiLgRMvTxmeiuZAZBQtWb7Gc3ppvUxZAgrACtqxeGCB2MNGy5fUReV2KcZCQZDZD` } }
  );
}

sendMessage();
