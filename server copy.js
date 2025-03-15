import mediasoup from "mediasoup";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";

const __dirname = path.resolve();
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://127.0.0.1:8000", // Allow this origin
    methods: ["GET", "POST"], // Allow these HTTP methods
    credentials: true, // Allow cookies to be sent
  },
});

app.use("/", express.static(path.join(__dirname, "static")));

/**
 * Worker
 * |-> Router(s)
 *     |-> Producer Transport(s)
 *         |-> Producer
 *     |-> Consumer Transport(s)
 *         |-> Consumer
 **/

let worker;
let rooms = {}; // { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
let peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers = []; // [ { socketId1, roomName1, producer, }, ... ]
let consumers = [];

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 4000,
    rtcMaxPort: 4999,
  });
  console.log(`worker created pid ${worker.pid}`);

  worker.on("died", (error) => {
    // This implies something serious happened, so kill the application
    console.error("mediasoup worker has died");
    setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
  });

  return worker;
};

// We create a Worker as soon as our application starts
worker = createWorker();

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




io.on("connection", async (socket) => {
  socket.emit("connection-success", {
    socketId: socket.id,
  });


  const createRoom = async (roomName, socketId) => {
    console.log('--------------------- createRoom -------------------')
    // worker.createRouter(options)
    // options = { mediaCodecs, appData }
    // mediaCodecs -> defined above
    // appData -> custom application data - we are not supplying any
    // none of the two are required
    let router1;
    let peers = [];
    if (rooms[roomName]) {
      console.log('rooms[roomName] exists', rooms[roomName])
      router1 = rooms[roomName].router;
      peers = rooms[roomName].peers || [];
      console.log('router1', router1)
      console.log('peers', peers)
    } else {
      console.log('rooms[roomName] does not exists', rooms[roomName])
      router1 = await worker.createRouter({ mediaCodecs });
      console.log('router1', router1)

    }
  
    console.log(` ===Router ID: ${router1.id}`, peers.length);

    console.log('rooms[roomName] before', rooms[roomName])
    
    rooms[roomName] = {
      router: router1,
      peers: [...peers, socketId],
    };
    
    console.log('--------------------- createRoom -------------------')
    console.log('rooms[roomName] after', rooms[roomName])
    console.log('--------------------- createRoom -------------------')
    console.log('all rooms', rooms)
    console.log('--------------------- createRoom -------------------')

  
    return router1;
  };


  const removeItems = (items, socketId, type) => {
    items.forEach((item) => {
      if (item.socketId === socket.id) {
        item[type].close();
      }
    });
    items = items.filter((item) => item.socketId !== socket.id);
  
    return items;
  };

  
  const addTransport = (transport, roomName, consumer) => {
    console.log('addTransport', transport)

    transports = [
      ...transports,
      { socketId: socket.id, transport, roomName, consumer, }
    ]
  
    peers[socket.id] = {
      ...peers[socket.id],
      transports: [
        ...peers[socket.id].transports,
        transport.id,
      ]
    }
  };


  function getTransport(socketId) {
    const [producerTransport] = transports.filter(transport => transport.socketId === socketId && !transport.consumer);
  
    console.log('getTransport', producerTransport); // Debugging
  
    if (!producerTransport) {
      console.error(`Transport not found for socketId: ${socketId}`);
      return null;
  }
  
    return producerTransport.transport;
  };


  const addProducer = (producer, roomName) => {
    producers = [
      ...producers,
      { socketId: socket.id, producer, roomName, }
    ]
  
    peers[socket.id] = {
      ...peers[socket.id],
      producers: [
        ...peers[socket.id].producers,
        producer.id,
      ]
    }
  };


  const informConsumers = (roomName, socketId, id) => {
    console.log(`just joined, id ${id} ${roomName}, ${socketId}`)
    // A new producer just joined
    // let all consumers to consume this producer
    producers.forEach(producerData => {
      if (producerData.socketId !== socketId && producerData.roomName === roomName) {
        const producerSocket = peers[producerData.socketId].socket
        // use socket to send producer id to producer
        producerSocket.emit('new-producer', { producerId: id })
      }
    })
  };


  const addConsumer = (consumer, roomName) => {
    // add the consumer to the consumers list
    consumers = [
      ...consumers,
      { socketId: socket.id, consumer, roomName, }
    ]

    // add the consumer id to the peers list
    peers[socket.id] = {
      ...peers[socket.id],
      consumers: [
        ...peers[socket.id].consumers,
        consumer.id,
      ]
    }
  };


  socket.on("disconnect", () => {
    // do some cleanup
    console.log("peer disconnected");
    consumers = removeItems(consumers, socket.id, "consumer");
    producers = removeItems(producers, socket.id, "producer");
    transports = removeItems(transports, socket.id, "transport");

    const { roomName } = peers[socket.id];
    delete peers[socket.id];

    // remove socket from room
    rooms[roomName] = {
      router: rooms[roomName].router,
      peers: rooms[roomName].peers.filter((socketId) => socketId !== socket.id),
    };
  });


  socket.on("joinRoom", async ({ roomName, userId }, callback) => {
    const router1 = await createRoom(roomName, socket.id);

    console.log('--------------------- joinRoom -------------------')
    console.log('peers[socket.id] before', peers[socket.id])

    peers[socket.id] = {
      socket,
      roomName, // Name for the Router this Peer joined
      userId,         
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: '',
        isAdmin: false,   // Is this Peer the Admin?
      }
    }

    console.log('peers[socket.id] after', peers[socket.id])

    const rtpCapabilities = router1.rtpCapabilities;

    console.log('rtpCapabilities', rtpCapabilities)

    console.log('--------------------- joinRoom -------------------')

    callback({ rtpCapabilities })
  });


  socket.on('createWebRtcTransport', async ({ consumer }, callback) => {
    console.log('---------------------------- createWebRtcTransport ------------------------')

    // get Room Name from Peer's properties
    const roomName = peers[socket.id].roomName;

    console.log("roomName", roomName)
    
    // get Router (Room) object this peer is in based on RoomName
    const router = rooms[roomName].router;
    
    console.log("router", router)

    createWebRtcTransport(router).then(
      transport => {
        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          }
        });
        
        
        
      console.log('----------------------------addTransport ----------------------------')
      // add transport to Peer's properties
      addTransport(transport, roomName, consumer)
      console.log('----------------------------addTransport ----------------------------')

    },
    error => {
      console.log(error)
    })
    console.log('---------------------------- createWebRtcTransport ------------------------')
  });


  socket.on('transport-connect', async ({ dtlsParameters }) => {
    console.log('transport-connect')
    
    const transport = getTransport(socket.id);
    
    if (!transport) {
        console.error(`Transport not found for socket ${socket.id}`);
        return; // Stop execution if transport is missing
    }

    transport.connect({ dtlsParameters });
  });


  socket.on('transport-produce', async ({ kind, rtpParameters, appData }, callback) => {
    const producer = await getTransport(socket.id).produce({
      kind,
      rtpParameters,
    })

    const { roomName } = peers[socket.id]

    addProducer(producer, roomName)

    informConsumers(roomName, socket.id, producer.id)


    producer.on('transportclose', () => {
      console.log('transport for this producer closed ')
      producer.close()
    })

    callback({
      id: producer.id,
      producersExist: producers.length>1 ? true : false
    })
  });


  socket.on('transport-recv-connect', async ({ dtlsParameters, serverConsumerTransportId }) => {
    const consumerTransport = transports.find(transportData => (
      transportData.consumer && transportData.transport.id == serverConsumerTransportId
    )).transport
    await consumerTransport.connect({ dtlsParameters })
  });


  socket.on('consume', async ({ rtpCapabilities, remoteProducerId, serverConsumerTransportId }, callback) => {
    try {

      const { roomName } = peers[socket.id]
      const router = rooms[roomName].router
      let consumerTransport = transports.find(transportData => (
        transportData.consumer && transportData.transport.id == serverConsumerTransportId
      )).transport

      // check if the router can consume the specified producer
      if (router.canConsume({
        producerId: remoteProducerId,
        rtpCapabilities
      })) {
        // transport can now consume and return a consumer
        const consumer = await consumerTransport.consume({
          producerId: remoteProducerId,
          rtpCapabilities,
          paused: true,
        })

        consumer.on('transportclose', () => {
          console.log('transport close from consumer')
        })

        consumer.on('producerclose', () => {
          console.log('producer of consumer closed')
          socket.emit('producer-closed', { remoteProducerId })

          consumerTransport.close([])
          transports = transports.filter(transportData => transportData.transport.id !== consumerTransport.id)
          consumer.close()
          consumers = consumers.filter(consumerData => consumerData.consumer.id !== consumer.id)
        })

        addConsumer(consumer, roomName)

        // from the consumer extract the following params
        // to send back to the Client
        const params = {
          id: consumer.id,
          producerId: remoteProducerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          serverConsumerId: consumer.id,
        }

        // send the parameters to the client
        callback({ params })
      }
    } catch (error) {
      console.log(error.message)
      callback({
        params: {
          error: error
        }
      })
    }
  });


  socket.on('consumer-resume', async ({ serverConsumerId }) => {
    console.log('consumer resume')
    const { consumer } = consumers.find(consumerData => consumerData.consumer.id === serverConsumerId)
    await consumer.resume()
  });

  socket.on('getProducers', callback => {
    //return all producer transports
    const { roomName } = peers[socket.id]

    let producerList = []
    producers.forEach(producerData => {
      if (producerData.socketId !== socket.id && producerData.roomName === roomName) {
        producerList = [...producerList, producerData.producer.id]
      }
    })

    // return the producer list back to the client
    callback(producerList)
  });
});


const createWebRtcTransport = async (router) => {
  console.log('createWebRtcTransport')
  return new Promise(async (resolve, reject) => {
    try {
      // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: '0.0.0.0', // replace with relevant IP address
            announcedIp: '192.168.11.107',
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      }

      // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
      let transport = await router.createWebRtcTransport(webRtcTransport_options)
      console.log('transport', transport)

      transport.on('dtlsstatechange', dtlsState => {
        if (dtlsState === 'closed') {
          transport.close()
        }
      })

      transport.on('close', () => {
        console.log('transport closed')
      })

      resolve(transport)

    } catch (error) {
      reject(error)
    }
  })
};

httpServer.listen(3000, () => {
  console.log("Socket.io server listening on port 3000");
});
