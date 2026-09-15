const { Server } = require("socket.io");

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    // Client tritt einem bestimmten Kalender (Room) bei
    socket.on("join_calendar", (calendarId) => {
      socket.join(calendarId);
      
      // Update room state
      const clients = io.sockets.adapter.rooms.get(calendarId);
      const count = clients ? clients.size : 0;
      io.to(calendarId).emit("room_count", count);
    });

    socket.on("door_ready", (data) => {
      // data: { calendarId, day }
      // Signal the other client that we are ready to open this door
      socket.to(data.calendarId).emit("partner_ready", data.day);
    });
    
    socket.on("door_opened_sync", (data) => {
      // data: { calendarId, day, result }
      socket.to(data.calendarId).emit("door_opened_sync", data);
    });

    // Pixel-Art Community Canvas
    socket.on("get_pixels", (calendarId) => {
      const cal = db.getCalendar(calendarId);
      if (cal) {
        socket.emit("pixels_state", cal.pixelGrid || {});
      }
    });

    socket.on("put_pixel", (data) => {
      // data: { calendarId, x, y, color }
      const cal = db.getCalendar(data.calendarId);
      if (cal) {
        db.updateCalendar(data.calendarId, (c) => {
          if (!c.pixelGrid) c.pixelGrid = {};
          c.pixelGrid[`${data.x},${data.y}`] = data.color;
          return c;
        });
        io.to(data.calendarId).emit("pixel_update", { x: data.x, y: data.y, color: data.color });
      }
    });

    // Multiplayer Duel
    socket.on("join_duel", (data) => {
      const room = `duel_${data.calendarId}_${data.day}`;
      socket.join(room);
      const clients = io.sockets.adapter.rooms.get(room);
      if (clients && clients.size >= 2) {
        io.to(room).emit("start_duel");
      }
    });

    socket.on("snowball_hit", (data) => {
      const room = `duel_${data.calendarId}_${data.day}`;
      socket.to(room).emit("opponent_hit");
    });

    socket.on("disconnecting", () => {
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          const clients = io.sockets.adapter.rooms.get(room);
          const count = clients ? clients.size - 1 : 0;
          io.to(room).emit("room_count", count);
        }
      });
    });
  });

  return io;
}

function getIo() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

module.exports = { initSocket, getIo };
