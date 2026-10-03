// Meeting (video call) socket events for Yuutube.
// Usage in index.js:  import { registerMeetingSockets } from "./socket/meetings.js";
//                     registerMeetingSockets(io);

const MAX_NAME_LENGTH = 40;
const MAX_CHAT_LENGTH = 500;
const MAX_BOARD_SEGMENTS = 20000;
const COORD_KEYS = ["x", "y", "previousX", "previousY"];

export function registerMeetingSockets(io) {
  // room -> participant[]  |  room -> settings
  const meetingParticipants = new Map();
  const meetingRooms = new Map();

  const isModerator = (socket, settings) =>
    Boolean(settings) &&
    (Boolean(socket.data.isHost) || settings.cohosts.has(socket.id));

  // A socket that is in the same room and actually admitted (not waiting).
  const memberOf = (room, socketId) => {
    const target = io.sockets.sockets.get(socketId);
    return target && target.data.meetingRoom === room && !target.data.waiting
      ? target
      : null;
  };

  // Moderators may act on anyone except themselves and the host.
  const canActOn = (socket, target) =>
    Boolean(target) && target.id !== socket.id && !target.data.isHost;

  const findParticipant = (room, socketId) =>
    (meetingParticipants.get(room) || []).find((item) => item.id === socketId);

  function leaveMeeting(socket) {
    const room = socket.data.meetingRoom;
    if (!room) return;
    const settings = meetingRooms.get(room);
    if (socket.data.waiting) {
      if (settings)
        settings.waiting = settings.waiting.filter(
          (entry) => entry.id !== socket.id,
        );
    } else {
      const remaining = (meetingParticipants.get(room) || []).filter(
        (participant) => participant.id !== socket.id,
      );
      if (remaining.length) meetingParticipants.set(room, remaining);
      else {
        meetingParticipants.delete(room);
        meetingRooms.delete(room);
      }
      settings?.cohosts.delete(socket.id);
      socket.to(room).emit("meeting:user-left", {
        id: socket.id,
        name: socket.data.meetingName,
      });
    }
    socket.leave(room);
    socket.data.meetingRoom = undefined;
    socket.data.isHost = false;
    socket.data.waiting = false;
  }

  io.on("connection", (socket) => {
    socket.on(
      "meeting:join",
      ({
        roomId,
        name,
        userId,
        isHost = false,
        audio = true,
        video = true,
      }) => {
        if (socket.data.meetingRoom && !socket.data.waiting) return;
        const cleanName = String(name || "")
          .trim()
          .slice(0, MAX_NAME_LENGTH);
        if (!roomId || !cleanName) return;
        const room = String(roomId);

        let settings = meetingRooms.get(room);
        if (!settings) {
          settings = {
            hostUserId: null,
            locked: false,
            waitingRoom: false,
            waiting: [],
            cohosts: new Set(),
            board: [],
            startedAt: new Date(),
          };
          meetingRooms.set(room, settings);
        }
        // The first signed-in user who asks for host owns the room, even if
        // guests arrived earlier. Guests without an account can never be host.
        if (!settings.hostUserId && isHost && userId)
          settings.hostUserId = String(userId);
        const host = Boolean(
          settings.hostUserId &&
          userId &&
          String(settings.hostUserId) === String(userId),
        );

        if (settings.locked && !host && !settings.cohosts.has(socket.id))
          return socket.emit("meeting:locked");

        if (settings.waitingRoom && !host && !settings.cohosts.has(socket.id)) {
          settings.waiting.push({ id: socket.id, name: cleanName, userId });
          socket.data.meetingRoom = room;
          socket.data.waiting = true;
          socket.emit("meeting:waiting");
          const hostSocket = (meetingParticipants.get(room) || []).find(
            (participant) => participant.isHost,
          );
          if (hostSocket)
            io.to(hostSocket.id).emit("meeting:approval-request", {
              socketId: socket.id,
              name: cleanName,
            });
          return;
        }

        const participants = meetingParticipants.get(room) || [];
        socket.emit("meeting:participants", participants);
        socket.join(room);
        socket.data.meetingRoom = room;
        socket.data.meetingName = cleanName;
        socket.data.userId = userId;
        socket.data.isHost = host;
        socket.data.waiting = false;
        const participant = {
          id: socket.id,
          name: cleanName,
          isHost: host,
          isCohost: false,
          audio: Boolean(audio),
          video: Boolean(video),
          hand: false,
        };
        meetingParticipants.set(room, [...participants, participant]);
        socket.to(room).emit("meeting:user-joined", participant);
        socket.emit("meeting:role", {
          isHost: host,
          locked: settings.locked,
          waitingRoom: settings.waitingRoom,
          startedAt: settings.startedAt,
        });
        // Late joiners get what is already drawn on the whiteboard.
        if (settings.board.length)
          socket.emit("meeting:whiteboard-history", settings.board);
      },
    );

    // WebRTC signalling. The sender's name travels along so the other side can
    // label the tile before any media arrives.
    for (const eventName of [
      "meeting:offer",
      "meeting:answer",
      "meeting:ice-candidate",
    ]) {
      socket.on(eventName, ({ target, ...payload } = {}) => {
        if (!target || !socket.data.meetingRoom) return;
        io.to(target).emit(eventName, {
          from: socket.id,
          name: socket.data.meetingName,
          ...payload,
        });
      });
    }

    socket.on("meeting:chat", ({ message } = {}) => {
      const room = socket.data.meetingRoom;
      const text = String(message || "").trim();
      if (!room || socket.data.waiting || !text) return;
      io.to(room).emit("meeting:chat", {
        senderId: socket.id,
        name: socket.data.meetingName,
        message: text.slice(0, MAX_CHAT_LENGTH),
        at: Date.now(),
      });
    });

    socket.on("meeting:media", ({ audio, video } = {}) => {
      const room = socket.data.meetingRoom;
      if (!room || socket.data.waiting) return;
      const participant = findParticipant(room, socket.id);
      if (participant) {
        if (typeof audio === "boolean") participant.audio = audio;
        if (typeof video === "boolean") participant.video = video;
      }
      socket.to(room).emit("meeting:media", { id: socket.id, audio, video });
    });

    socket.on("meeting:hand", ({ raised } = {}) => {
      const room = socket.data.meetingRoom;
      if (!room || socket.data.waiting) return;
      const participant = findParticipant(room, socket.id);
      if (participant) participant.hand = Boolean(raised);
      io.to(room).emit("meeting:hand", {
        id: socket.id,
        name: socket.data.meetingName,
        raised: Boolean(raised),
      });
    });

    socket.on("meeting:reaction", ({ emoji } = {}) => {
      const room = socket.data.meetingRoom;
      const clean = String(emoji || "").slice(0, 8);
      if (!room || socket.data.waiting || !clean) return;
      io.to(room).emit("meeting:reaction", {
        id: socket.id,
        name: socket.data.meetingName,
        emoji: clean,
      });
    });

    socket.on("meeting:whiteboard", (data) => {
      const room = socket.data.meetingRoom;
      const settings = meetingRooms.get(room);
      if (!settings || socket.data.waiting || !data) return;
      if (COORD_KEYS.some((key) => !Number.isFinite(data[key]))) return;
      const segment = {
        x: data.x,
        y: data.y,
        previousX: data.previousX,
        previousY: data.previousY,
        color:
          typeof data.color === "string" && /^#[0-9a-f]{3,8}$/i.test(data.color)
            ? data.color
            : "#ef4444",
      };
      settings.board.push(segment);
      if (settings.board.length > MAX_BOARD_SEGMENTS)
        settings.board.splice(0, settings.board.length - MAX_BOARD_SEGMENTS);
      socket.to(room).emit("meeting:whiteboard", segment);
    });

    socket.on("meeting:whiteboard-clear", () => {
      const room = socket.data.meetingRoom;
      const settings = meetingRooms.get(room);
      if (!settings || socket.data.waiting) return;
      settings.board = [];
      socket.to(room).emit("meeting:whiteboard-clear");
    });

    socket.on("meeting:mute-all", () => {
      const room = socket.data.meetingRoom;
      const settings = meetingRooms.get(room);
      if (!isModerator(socket, settings)) return;
      for (const participant of meetingParticipants.get(room) || [])
        if (participant.id !== socket.id) participant.audio = false;
      socket.to(room).emit("meeting:force-mute");
      io.to(room).emit("meeting:host-muted", { kind: "all" });
    });

    socket.on("meeting:stop-audio", ({ socketId } = {}) => {
      const room = socket.data.meetingRoom;
      if (!isModerator(socket, meetingRooms.get(room))) return;
      const target = memberOf(room, socketId);
      if (!canActOn(socket, target)) return;
      const participant = findParticipant(room, target.id);
      if (participant) participant.audio = false;
      target.emit("meeting:force-mute");
      io.to(room).emit("meeting:host-muted", {
        id: target.id,
        name: target.data.meetingName,
        kind: "audio",
      });
    });

    socket.on("meeting:stop-video", ({ socketId } = {}) => {
      const room = socket.data.meetingRoom;
      if (!isModerator(socket, meetingRooms.get(room))) return;
      const target = memberOf(room, socketId);
      if (!canActOn(socket, target)) return;
      const participant = findParticipant(room, target.id);
      if (participant) participant.video = false;
      target.emit("meeting:force-video-off");
      io.to(room).emit("meeting:host-muted", {
        id: target.id,
        name: target.data.meetingName,
        kind: "video",
      });
    });

    socket.on("meeting:toggle-lock", () => {
      const room = socket.data.meetingRoom;
      const settings = meetingRooms.get(room);
      if (!isModerator(socket, settings)) return;
      settings.locked = !settings.locked;
      io.to(room).emit("meeting:lock", settings.locked);
    });

    socket.on("meeting:toggle-waiting", ({ enabled } = {}) => {
      const room = socket.data.meetingRoom;
      const settings = meetingRooms.get(room);
      if (!settings || !socket.data.isHost) return;
      settings.waitingRoom = Boolean(enabled);
      io.to(room).emit("meeting:waiting-status", settings.waitingRoom);
    });

    socket.on("meeting:approve", ({ socketId } = {}) => {
      const room = socket.data.meetingRoom;
      const settings = meetingRooms.get(room);
      if (!isModerator(socket, settings)) return;
      const waiting = settings.waiting.find((entry) => entry.id === socketId);
      settings.waiting = settings.waiting.filter(
        (entry) => entry.id !== socketId,
      );
      if (waiting)
        io.to(socketId).emit("meeting:approved", {
          roomId: room,
          name: waiting.name,
          userId: waiting.userId,
        });
    });

    socket.on("meeting:kick", ({ socketId } = {}) => {
      const room = socket.data.meetingRoom;
      if (!isModerator(socket, meetingRooms.get(room))) return;
      const target = memberOf(room, socketId);
      if (!canActOn(socket, target)) return;
      io.to(room).emit("meeting:removed", {
        id: target.id,
        name: target.data.meetingName,
      });
      target.emit("meeting:kicked");
      // Enforced here, so a modified client can't stay in the room.
      leaveMeeting(target);
    });

    socket.on("meeting:cohost", ({ socketId } = {}) => {
      const room = socket.data.meetingRoom;
      const settings = meetingRooms.get(room);
      if (!settings || !socket.data.isHost) return;
      const target = memberOf(room, socketId);
      if (!target || target.id === socket.id) return;
      const enabled = !settings.cohosts.has(target.id);
      if (enabled) settings.cohosts.add(target.id);
      else settings.cohosts.delete(target.id);
      const participant = findParticipant(room, target.id);
      if (participant) participant.isCohost = enabled;
      target.emit("meeting:cohost", enabled);
      io.to(room).emit("meeting:cohost-changed", {
        id: target.id,
        isCohost: enabled,
      });
    });

    socket.on("meeting:end", () => {
      const room = socket.data.meetingRoom;
      if (!room || !socket.data.isHost) return;
      const settings = meetingRooms.get(room);

      io.to(room).emit("meeting:ended");

      for (const participant of meetingParticipants.get(room) || []) {
        const memberSocket = io.sockets.sockets.get(participant.id);
        if (memberSocket) {
          memberSocket.leave(room);
          memberSocket.data.meetingRoom = undefined;
          memberSocket.data.isHost = false;
          memberSocket.data.waiting = false;
        }
      }
      if (settings) {
        for (const waitingEntry of settings.waiting) {
          const waitingSocket = io.sockets.sockets.get(waitingEntry.id);
          if (waitingSocket) {
            waitingSocket.leave(room);
            waitingSocket.data.meetingRoom = undefined;
            waitingSocket.data.waiting = false;
          }
        }
      }
      meetingParticipants.delete(room);
      meetingRooms.delete(room);
    });

    socket.on("disconnect", () => leaveMeeting(socket));
  });
}
