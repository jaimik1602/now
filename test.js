const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const WHATSAPP_API_URL =
  "https://graph.facebook.com/v21.0/469434999592396/messages";
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

// User sessions to manage chat state
const userSessions = {};

// Track session timeouts
const sessionTimeouts = {};

// Helper function to reset user state
function resetUserState(from) {
  if (sessionTimeouts[from]) {
    clearTimeout(sessionTimeouts[from]);
    delete sessionTimeouts[from];
  }
  userSessions[from] = {
    step: 0,
    vehicleAttempts: 0,
    locationAttempts: 0,
    sessionStartTime: Date.now(),
  };
  sessionTimeouts[from] = setTimeout(async () => {
    delete userSessions[from];
    delete sessionTimeouts[from];
    await sendWhatsAppMessage(
      from,
      "Your session has ended. Send 'Hi' to start the conversation.",
      "en"
    );
   
  }, 30 * 60 * 1000); // 5 minutes in milliseconds
}

exports.handleMessage = async (req, res) => {
  await axios.post(
    "https://whatsinfinity.com/webhook/whatsapp/202501211304156SruZ",
    req.body
  );

  const app = express();
  app.use(bodyParser.json());

  console.log(JSON.stringify(req.body, null, 2));
  const messages = req.body.entry[0].changes[0].value.messages;
  if (!messages || messages.length === 0) return res.sendStatus(200);

  const message = messages[0];
  const from = message.from;
  const name =
    req.body.entry[0].changes[0].value.contacts?.[0]?.profile?.name ||
    "Unknown";
  const text = message.text?.body?.trim();
  const currentWeek = getCurrentWeek();

  // Save the number and WhatsApp name to the database
  var temp = await saveContactToDatabase(from, name);

  if (!userSessions[from]) resetUserState(from);

  const userState = userSessions[from];

  try {
    // Check if the sender is blocked
    const isBlocked = await checkBlockStatus(from); // Replace with your blocklist function
    if (isBlocked) {
      console.log(`blocked:- ${from}`);
      return; // Stop further processing
    }
    console.log(`Sender:- ${from} And Msg:- ${text}`);
    if (
      // userState.step === 0 &&
      typeof text === "string" &&
      text.toLowerCase() === "hi"
    ) {
      // resetUserState(from);
      await sendWhatsAppMessage(
        from,
        "Please enter your vehicle number.",
        "en"
      );
      
      userState.step = 1;
    } else if (typeof text === "string" && text.toLowerCase() == "stop") {
      resetUserState(from);
    } else if (userState.step === 1) {
      const formattedVehicleNumber = formatVehicleNumber(text);
      const phoneNumber = from; // Assuming 'from' contains the user's mobile number
      console.log(
        `Vehicle Number: ${formattedVehicleNumber}, Phone Number: ${phoneNumber}`
      );
      // Check if the sender is blocked
      const isBlocked = await checkVehBlockStatus(formattedVehicleNumber); // Replace with your blocklist function
      if (isBlocked) {
        console.log(`blocked:- ${formattedVehicleNumber}`);
        return; // Stop further processing
      }
      const response = await fetchVehicle(formattedVehicleNumber, phoneNumber);

      if (!response.success || !response.data[0]?.deviceid) {
        if (response.message == "expiry") {
          resetUserState(from);
          await sendWhatsAppMessage(
            from,
            "Vehicle Recharge is over!!!\nContact on this number :- +91 88662 65662",
            "en"
          );
         
        } else {
          userState.vehicleAttempts += 1;
          if (userState.vehicleAttempts >= 3) {
            resetUserState(from);
            await sendWhatsAppMessage(
              from,
              "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.",
              "en"
            );
            
          } else {
            await sendWhatsAppMessage(
              from,
              `Enter Correct Vehicle Number!!!`,
              "en"
            );
           
          }
        }
      } else {
        var userlevel = await checkUserLevel(phoneNumber);
        //user level check
        if (userlevel.user_level) {
          userState.vehicleNumber = formattedVehicleNumber;
          userState.imei = response.data[0].deviceid;
          userState.agency = response.data[0].agency;
          userState.subagency = response.data[0].subagency;
       
          await sendInteractiveMessage(from, [
            formattedVehicleNumber,
            response.data[0].lattitude,
            response.data[0].longitude,
            response.data[0].speed,
            response.data[0].received_Date,
            response.data[0].servertime,
          ]);
          userState.step = 2;
          // }
        } else {
          //
          var result = await weekCheck(
            formattedVehicleNumber,
            phoneNumber,
            currentWeek,
            userlevel.vehicle_count
          );
          if (result) {
            userState.vehicleNumber = formattedVehicleNumber;
            userState.imei = response.data[0].deviceid;
            userState.agency = response.data[0].agency;
            userState.subagency = response.data[0].subagency;
         
            await sendInteractiveMessage(from, [
              formattedVehicleNumber,
              response.data[0].lattitude,
              response.data[0].longitude,
              response.data[0].speed,
              response.data[0].received_Date,
              response.data[0].servertime,
            ]);
            userState.step = 2;
            // }
          } else {
            resetUserState(from);
            await sendWhatsAppMessage(
              from,
              "You've reached your weekly limit for vehicle complaints, please try another mobile number to register a complaint.",
              "en"
            );
            
          }
          //
        }
      }
    } else if (userState.step === 2) {
      const buttonId = message.interactive.button_reply.id;
      if (buttonId === "update_button") {
        await sendLocationRequest(from);
        userState.step = 3;
      } else {
        userState.locationAttempts += 1;
        if (userState.locationAttempts >= 3) {
          resetUserState(from);
          await sendWhatsAppMessage(
            from,
            "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.",
            "en"
          );
          await sendWhatsAppMessageOF(
            from,
            "आपने अनुमत प्रयासों को पार कर लिया है। 'Hi' भेजकर बातचीत शुरू करें।",
            "hi"
          );
          await sendWhatsAppMessageOF(
            from,
            "તમે અનુમતિ આપેલા પ્રયત્નો પાર કરી દીધા છે. 'Hi' મોકલીને સંવાદ શરૂ કરો.",
            "gu"
          );
        } else {
          await sendWhatsAppMessage(from, `Invalid option.`, "en");
          await sendWhatsAppMessageOF(from, `अमान्य विकल्प।`, "hi");
          await sendWhatsAppMessageOF(from, `અમાન્ય વિકલ્પ.`, "gu");
        }
      }
    } else if (userState.step === 3) {
      if (message.location) {
        const { latitude, longitude } = message.location;
        userState.latitude = parseFloat(latitude).toFixed(6);
        userState.longitude = parseFloat(longitude).toFixed(6);
        await submitComplaint(from, userState);
        resetUserState(from);
      } else {
        userState.locationAttempts += 1;
        if (userState.locationAttempts >= 3) {
          resetUserState(from);
          await sendWhatsAppMessage(
            from,
            "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.",
            "en"
          );
          await sendWhatsAppMessageOF(
            from,
            "आपने अनुमत प्रयासों को पार कर लिया है। 'Hi' भेजकर बातचीत शुरू करें।",
            "hi"
          );
          await sendWhatsAppMessageOF(
            from,
            "તમે અનુમતિ આપેલા પ્રયત્નો પાર કરી દીધા છે. 'Hi' મોકલીને સંવાદ શરૂ કરો.",
            "gu"
          );
        } else {
          await sendWhatsAppMessage(
            from,
            `Please share a valid location.`,
            "en"
          );
            }
      }
    } else {
      resetUserState(from);
      await sendWhatsAppMessage(
        from,
        "Sorry, I didn't understand that. Send 'Hi' to start the conversation.",
        "en"
      );
      
    }
  } catch (error) {
    console.error("Error:", error);
    await sendWhatsAppMessage(
      from,
      "An error occurred. Please try again.",
      "en"
    );
   
  }
};

const checkBlockStatus = async (phoneNumber) => {
  try {
    const query = "SELECT blocked FROM users WHERE phone_number = ? LIMIT 1";
    const [results] = await db.execute(query, [phoneNumber]);

    if (results.length === 0) {
      return false; // Number not found
    }

    return results[0].blocked === 1; // Return true if the user is blocked
  } catch (error) {
    console.error("Error checking block status:", error);
    throw new Error("Database error");
  }
};

const checkVehBlockStatus = async (vehicle_number) => {
  try {
    const query =
      "SELECT block FROM vehicle_list WHERE vehicle_number = ? LIMIT 1";
    const [results] = await db.execute(query, [vehicle_number]);

    if (results.length === 0) {
      console.log(results);
      return false; // Number not found
    }

    return results[0].block === 1; // Return true if the user is blocked
  } catch (error) {
    console.error("Error checking block status:", error);
    throw new Error("Database error");
  }
};

// Utility: Get current week number
const getCurrentWeek = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
};

async function weekCheck(vehicleNumber, mobileNumber, currentWeek, limit) {
  try {
    // Step 1: Check if the vehicle is already registered this week
    const [result] = await db.query(
      "SELECT * FROM weekly_data WHERE vehicle_number = ? AND mobile_number = ? AND week = ?",
      [vehicleNumber, mobileNumber, currentWeek]
    );

    if (result.length > 0) {
      // Vehicle is already registered this week
      console.log("Already Registered");
      return true; // Already registered, return true
    } else {
      // Step 2: Check how many vehicles the user has registered this week
      const [countResult] = await db.query(
        "SELECT COUNT(DISTINCT vehicle_number) AS vehicle_count FROM weekly_data WHERE mobile_number = ? AND week = ?",
        [mobileNumber, currentWeek]
      );

      const vehicleCount = countResult[0].vehicle_count;
      if (vehicleCount >= limit) {
        // User has already registered two vehicles this week
        return false; // Limit reached, return false
      } else {
        // Step 3: Register the new vehicle
        await db.query(
          "INSERT INTO weekly_data (vehicle_number, mobile_number, week, created_at) VALUES (?, ?, ?, NOW())",
          [vehicleNumber, mobileNumber, currentWeek]
        );

        console.log("Vehicle Added!!");
        return true; // Vehicle successfully added, return true
      }
    }
  } catch (err) {
    return { message: "Database error.", error: err }; // Handle any errors
  }
}

// Database function to save contact information
async function saveContactToDatabase(number, name) {
  try {
    // Query to check if the phone_number and name match
    const checkQuery = `SELECT * FROM users WHERE phone_number = ? AND name = ?`;
    const [results] = await db.execute(checkQuery, [number, name]);

    // If a matching record is found, do nothing
    if (results.length > 0) {
      console.log(`Contact already exists: ${number} - ${name}`);
      return;
    }

    // Insert or update the contact
    const query = `
      INSERT INTO users (phone_number, name) 
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `;
    await db.execute(query, [number, name]);
    console.log(`Saved or updated contact: ${number} - ${name}`);
  } catch (err) {
    console.error("Error interacting with the database:", err);
  }
}

// Function to check user_level based on mobile number using async/await
async function checkUserLevel(mobileNumber) {
  try {
    const [results] = await db.execute(
      "SELECT * FROM users WHERE phone_number = ?",
      [mobileNumber]
    );

    if (results.length > 0) {
      // return user_level: results[0].user_level, results[0].vehicle_count; // Returns true if user_level is 1, else false
      return {
        user_level: results[0].user_level,
        vehicle_count: results[0].vehicle_count,
      };
    } else {
      return false; // Returns false if user not found
    }
  } catch (err) {
    console.error("Database error:", err);
    return false; // Return false in case of an error
  }
}

async function sendWhatsAppMessageOF(to, text, language) {
  const languages = {
    hi: "hi_IN",
    gu: "gu_IN",
  };
  const selectedLanguage = languages[language] || "en_US";
  await axios.post(
    WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
      language: { code: selectedLanguage },
    },
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
}

// Function to check and add vehicle number and phone number to the database

async function sendWhatsAppMessage(to, text, language) {
  await axios.post(
    "https://whatsinfinity.com/api/send",
    {
      phone: "+" + to,
      message: text,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer vdOBq2F0LlMWwO9MR4Bf8eudGcxSN5OohDmxt39P",
      },
      maxBodyLength: Infinity,
    }
  );
}

async function checkAndAddVehicleToDB(vehicleNumber, phoneNumber) {
  try {
    // Check if the vehicle number already exists in the database
    const [rows] = await db.query(
      "SELECT * FROM vehicle_list WHERE vehicle_number = ?",
      [vehicleNumber]
    );
    if (rows.length === 0) {
      // If vehicle number does not exist, insert it along with the phone number
      await db.query(
        "INSERT INTO vehicle_list (vehicle_number, phone_number) VALUES (?, ?)",
        [vehicleNumber, phoneNumber]
      );
      console.log(
        `Vehicle number ${vehicleNumber} and phone number ${phoneNumber} added to the database.`
      );
    } else {
      console.log(
        `Vehicle number ${vehicleNumber} already exists in the database.`
      );
    }
  } catch (error) {
    console.error("Error adding vehicle to database:", error);
  }
}





// Function to format vehicle number
function formatVehicleNumber(vehicleNumber) {
  // Remove spaces and normalize vehicle number formatting
  return vehicleNumber.replace(/\s+/g, "").toUpperCase();
}

// Function to fetch vehicle details from API
async function fetchVehicle(vehicleNumber, phoneNumber) {
  try {
    const res = await axios.get(
      `https://app.jaimik.com/wp_api/wp_check.php?vehicleNumber=${vehicleNumber}`
    );

    if (res.data && res.data[0] && res.data[0].deviceid) {
      // After verifying, check and add to the database
      await checkAndAddVehicleToDB(vehicleNumber, phoneNumber);
      // if (await expiryCheck(vehicleNumber)) {
      //   return {
      //     success: false, //need
      //     message: "expiry",
      //   };
      // } else {
      return { success: true, data: res.data };
      // }
    } else {
      return {
        success: false, //need+
        message: "No data found for this vehicle number.",
      };
    }
  } catch (error) {
    return { success: false, message: "Error while fetching vehicle data." };
  }
}

" in this code i just want to add 2 function first save uniqe sub agancy to my database table name sub_agncy and second if sub_agancy status value is 1 so it means that agancy is block no do nothing"