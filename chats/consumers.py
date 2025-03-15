from channels.generic.websocket import AsyncWebsocketConsumer
import json

import socketio

# Create a global Socket.IO client
sio = socketio.AsyncClient()

async def connect_to_mediasoup():
    await sio.connect("http://localhost:3000")

class MediasoupConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        if not sio.connected:
            await connect_to_mediasoup()
        # await self.send(json.dumps({
        #     "message": "Connected to Django signaling server and Mediasoup Node server."
        # }))

    async def disconnect(self, close_code):
        await sio.disconnect()

    async def receive(self, text_data):
        data = json.loads(text_data)
        print('async def receive(self, text_data): data', data)
        # action = data.get("action")
        # if action == "join_room":
        #     room_id = data.get("room_id")
        #     # For simplicity, we just echo a join confirmation.
        #     await self.send(json.dumps({
        #         "message": f"Joined room {room_id}"
        #     }))
        # elif action == "create_transport":
        #     # Forward the event to the Node.js server via Socket.IO.
        #     await sio.emit("createTransport", {}, callback=self.handle_transport_response)
        # elif action == "produce":
        #     payload = {
        #         "transportId": data.get("transportId"),
        #         "kind": data.get("kind"),
        #         "rtpParameters": data.get("rtpParameters")
        #     }
        #     await sio.emit("produce", payload, callback=self.handle_produce_response)
        # else:
        #     await self.send(json.dumps({"message": "Unknown action"}))

    # async def handle_transport_response(self, response):
    #     # Send the transport details back to the WebSocket client.
    #     await self.send(json.dumps({
    #         "action": "transport_created",
    #         "data": response
    #     }))

    # async def handle_produce_response(self, response):
    #     await self.send(json.dumps({
    #         "action": "produced",
    #         "data": response
    #     }))
