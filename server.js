import mediasoup from "mediasoup";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

const __dirname = path.resolve();
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://127.0.0.1:8000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

let worker;
let router;
let producerTransport = new Map();
let producer = new Map();

let consumerTransport;
let consumers = new Map();

const peers = io.of("/livestream");

// const createWorker = async () => {
//   worker = await mediasoup.createWorker({
//     rtcMinPort: 2000,
//     rtcMaxPort: 2020,
//   })
//   console.log(`worker pid ${worker.pid}`)

//   worker.on('died', error => {
//     console.error('mediasoup worker has died')
//     setTimeout(() => process.exit(1), 2000)
//   })

//   return worker
// };

// async function createRoom() {
//   worker = await createWorker();
//   router = await worker.createRouter({ mediaCodecs });
//   console.log("Router created with id:", router.id);
// };
// createRoom();

(async () => {
  const worker = await mediasoup.createWorker();
  router = await worker.createRouter({ mediaCodecs });
})();

peers.on("connection", async (socket) => {
  console.log("New client connected:", socket.id);

  socket.emit("connection-success", {
    socketId: socket.id,
  });

  socket.on("getRtpCapabilities", (callback) => {
    const rtpCapabilities = router.rtpCapabilities;

    console.log("rtp Capabilities ...");
    callback({ rtpCapabilities });
  });

  socket.on(
    "createWebRtcTransport",
    async ({ sender, publisherId, mediaType }, callback) => {
      console.log(`mediaType:  ${mediaType}`);
      if (sender) {
        if (publisherId && mediaType) {
          const newProducerTransport = await createWebRtcTransport(callback);
          if (producerTransport.has(publisherId)) {
            producerTransport
              .get(publisherId)
              .set(mediaType, newProducerTransport);
          } else {
            producerTransport.set(
              publisherId,
              new Map([[mediaType, newProducerTransport]])
            );
          }
        } else {
          callback({ error: "publisher Id or mediaType undefined" });
        }
      } else {
        consumerTransport = await createWebRtcTransport(callback);
      }
    }
  );

  socket.on(
    "transport-connect",
    async ({ dtlsParameters, publisherId, mediaType }, callback) => {
      // console.log('DTLS PARAMS... ', { dtlsParameters })
      if (publisherId && mediaType) {
        await producerTransport
          .get(publisherId)
          .get(mediaType)
          .connect({ dtlsParameters });
      } else {
        callback({ error: "publisher Id or mediaType undefined" });
      }
    }
  );

  socket.on(
    "transport-produce",
    async (
      { kind, rtpParameters, appData, publisherId, mediaType },
      callback
    ) => {
      if (publisherId && mediaType) {
        const newProducer = await producerTransport
          .get(publisherId)
          .get(mediaType)
          .produce({
            kind,
            rtpParameters,
          });

        if (producer.has(publisherId)) {
          producer.get(publisherId).set(mediaType, newProducer);
        } else {
          producer.set(publisherId, new Map([[mediaType, newProducer]]));
        }

        newProducer.on("transportclose", () => {
          console.log("transport for this producer closed ");
          newProducer.close();
        });

        callback({
          id: newProducer.id,
        });
      } else {
        callback({ error: "publisher Id or mediaType undefined" });
      }
    }
  );

  socket.on("transport-recv-connect", async ({ dtlsParameters }) => {
    console.log(`transport-recv-connect`);
    await consumerTransport.connect({ dtlsParameters });
  });

  socket.on("consume", async ({ rtpCapabilities, publisherId }, callback) => {
    try {
      const targetProducer = producer.get(publisherId);
      if (!targetProducer) {
        return callback({ error: "No producers found for this publisher." });
      }
      for (const [mediaType, prod] of targetProducer.entries()) {
        if (
          router.canConsume({
            producerId: prod.id,
            rtpCapabilities,
          })
        ) {
          const consumer = await consumerTransport.consume({
            producerId: prod.id,
            rtpCapabilities,
            paused: false,
          });
          consumer.on("transportclose", () => {
            console.log("transport close from consumer");
          });
          consumer.on("producerclose", () => {
            console.log("producer of consumer closed");
            consumer.close();
          });

          if (consumers.has(publisherId)) {
            consumers.get(publisherId).set(mediaType, consumer);
          } else {
            consumers.set(publisherId, new Map([[mediaType, consumer]]));
          }
        }
      }

      const params = [];

      for (const [publisherId, mediaMap] of consumers) {

        for (const [mediaType, consumer] of mediaMap) {
          
          params.push({
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            mediaType,
          });

        }
      }

      
      callback({ params });

    } catch (error) {
      console.log(error.message);
      callback({
        params: {
          error: error,
        },
      });
    }
  });

  // socket.on('consumer-resume', async () => {
  //   console.log('consumer resume')
  //   await consumer.resume()
  // });
});

async function createWebRtcTransport(callback) {
  try {
    const webRtcTransport_options = {
      listenIps: [
        {
          ip: "0.0.0.0",
          announcedIp: "127.0.0.1",
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };

    let transport = await router.createWebRtcTransport(webRtcTransport_options);
    console.log(`transport id: ${transport.id}`);

    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed") {
        transport.close();
      }
    });

    transport.on("close", () => {
      console.log("transport closed");
    });

    callback({
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    });

    return transport;
  } catch (error) {
    console.log(error);
    callback({
      params: {
        error: error,
      },
    });
  }
}

httpServer.listen(3000, () => {
  console.log("Socket.io server listening on port 3000");
});
