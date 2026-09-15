// Mock Service für Postkarten-Versand (z.B. MyPostcard oder Lob API)

async function sendPostcard(recipientName, calendarTitle, day24Content) {
  console.log(`[POSTCARD API MOCK] Sending postcard to ${recipientName}...`);
  console.log(`[POSTCARD API MOCK] Title: ${calendarTitle}`);
  
  // Hier würde man normalerweise einen Request an eine echte API senden.
  // z.B. 
  // await fetch('https://api.mypostcard.com/v1/order', { ... })
  
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`[POSTCARD API MOCK] Successfully dispatched!`);
      resolve({ success: true, orderId: "mock-" + Date.now() });
    }, 500);
  });
}

module.exports = { sendPostcard };
