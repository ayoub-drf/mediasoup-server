const profileCards = Array.from(document.querySelectorAll("#profile-card"));
const profileCardContainer = document.querySelector(
  "#profile-container-display"
);

profileCards.forEach((profileCard) => {
  profileCard.addEventListener("click", (e) => {
    let targetProfileCard = e.currentTarget.cloneNode(true);

    // Clear the container and set display to flex
    profileCardContainer.innerHTML = "";
    profileCardContainer.style.display = "flex";
    profileCardContainer.style.justifyContent = "center";
    profileCardContainer.appendChild(targetProfileCard);

    // Adjust the classes for the new style
    targetProfileCard.classList.remove(
      "cursor-pointer",
      "h-56",
      "bg-cover",
      "bg-center"
    );
    targetProfileCard.classList.add(
      "flex",
      "justify-center",
      "items-center",
      "h-[450px]",
      "w-3/4",
      "rounded",
      "bg-black"
    );

    // Resize the video inside the cloned card
    const video = targetProfileCard.querySelector("video");
    if (video) {
      video.classList.remove("w-full", "h-full");
      video.classList.add("w-3/4", "h-[450px]", "object-cover", "rounded");
    }

    // Update overlay style (if present)
    const overlay = targetProfileCard.querySelector(".absolute");
    if (overlay) {
      overlay.classList.remove("inset-0", "flex");
      overlay.classList.add(
        "hidden",
        "inset-0",
        "items-center",
        "justify-center",
        "bg-opacity-70"
      );
    }
  });
});

const mediasoupClient = require("mediasoup-client");
const io = require("socket.io-client");
const socket = io("http://localhost:3000");

const localVideo = document.querySelector("#local-video");
const roomName = JSON.parse(document.querySelector("#room-name").textContent);


// https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
let params = {
  // mediasoup params
  encodings: [
    {
      rid: 'r0',
      maxBitrate: 100000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r1',
      maxBitrate: 300000,
      scalabilityMode: 'S1T3',
    },
    {
      rid: 'r2',
      maxBitrate: 900000,
      scalabilityMode: 'S1T3',
    },
  ],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000
  }
};

let rtpCapabilities;
let device;
let callerId = userId;
let producerTransport
let consumerTransports = []
let audioProducer
let videoProducer
let consumingTransports = [];
let audioParams;
let videoParams = { params };
let consumer
let isProducer = false;



socket.on("connection-success", async ({ socketId }) => {
  console.log("socket id", socketId);

  getLocalStream();
});


socket.on('new-producer', ({ producerId }) => signalNewConsumerTransport(producerId))


const signalNewConsumerTransport = async (remoteProducerId) => {
  console.log('signalNewConsumerTransport')
  //check if we are already consuming the remoteProducerId
  if (consumingTransports.includes(remoteProducerId)) return;
  consumingTransports.push(remoteProducerId);

  await socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
    // The server sends back params needed 
    // to create Send Transport on the client side
    if (params.error) {
      console.log(params.error)
      return
    }
    console.log(`PARAMS... ${params}`)

    let consumerTransport;
    try {
      consumerTransport = device.createRecvTransport(params)
    } catch (error) {
      // exceptions: 
      // {InvalidStateError} if not loaded
      // {TypeError} if wrong arguments.
      console.log(error)
      return
    }

    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-recv-connect', ...)
        await socket.emit('transport-recv-connect', {
          dtlsParameters,
          serverConsumerTransportId: params.id,
        })

        // Tell the transport that parameters were transmitted.
        callback()
      } catch (error) {
        // Tell the transport that something was wrong
        errback(error)
      }
    })

    connectRecvTransport(consumerTransport, remoteProducerId, params.id)
  })
};


const getProducers = () => {
  socket.emit('getProducers', producerIds => {
    console.log('getProducers ', producerIds)
    // for each of the producer create a consumer
    // producerIds.forEach(id => signalNewConsumerTransport(id))
    producerIds.forEach(signalNewConsumerTransport)
  })
}



const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
  // for consumer, we need to tell the server first
  // to create a consumer based on the rtpCapabilities and consume
  // if the router can consume, it will send back a set of params as below
  await socket.emit('consume', {
    rtpCapabilities: device.rtpCapabilities,
    remoteProducerId,
    serverConsumerTransportId,
  }, async ({ params }) => {
    if (params.error) {
      console.log('Cannot Consume')
      return
    }

    // console.log(`Consumer Params ${params}`)
    // then consume with the local consumer transport
    // which creates a consumer
    const consumer = await consumerTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters
    })

    consumerTransports = [
      ...consumerTransports,
      {
        consumerTransport,
        serverConsumerTransportId: params.id,
        producerId: remoteProducerId,
        consumer,
      },
    ]

    console.log("params.kind", params.kind)

    // create a new div element for the new consumer media
    // const newElem = document.createElement('div')
    // newElem.setAttribute('id', `td-${remoteProducerId}`)

    if (params.kind == 'video') {
      const video = document.createElement('video');
      // video.id = 'remoteProducerId';
      video.className = 'w-full rounded-lg shadow-lg';
      video.muted = true;
      video.autoplay = true;
      video.controls = true;
      const { track } = consumer;
      video.srcObject = new MediaStream([track])
      document.getElementById("video-container").append(video)
    }

    // if (params.kind == 'audio') {
    //   //append to the audio container
    //   newElem.innerHTML = '<audio id="' + remoteProducerId + '" autoplay></audio>'
    // } else {
    //   //append to the video container
    //   newElem.setAttribute('class', 'remoteVideo')
    //   newElem.innerHTML = '<video id="' + remoteProducerId + '" autoplay class="video" ></video>'
    // }

    // videoContainer.appendChild(newElem)

    // destructure and retrieve the video track from the producer
    // const { track } = consumer

    // document.getElementById(remoteProducerId).srcObject = new MediaStream([track])

    // the server consumer started with media paused
    // so we need to inform the server to resume
    socket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
  })
}



function getLocalStream() {
  console.log('getLocalStream')
  navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: {
        width: {
          min: 640,
          max: 1920,
        },
        height: {
          min: 400,
          max: 1080,
        },
      },
    })
    .then(streamSuccess)
    .catch((error) => {
      console.log(error.message);
    });
};


const streamSuccess = (stream) => {
  console.log('streamSuccess')
  localVideo.srcObject = stream;

  audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
  videoParams = { track: stream.getVideoTracks()[0], ...videoParams };

  joinRoom();
};


const joinRoom = () => {
  console.log('joinRoom')
  socket.emit("joinRoom", { roomName, userId }, (data) => {
    rtpCapabilities = data.rtpCapabilities;

    createDevice();
  });
};


async function createDevice() {
  console.log('createDevice')
  try {
    device = new mediasoupClient.Device();

    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
    // Loads the device with RTP capabilities of the Router (server side)
    await device.load({
      // see getRtpCapabilities() below
      routerRtpCapabilities: rtpCapabilities,
    });


    createSendTransport();
  } catch (error) {
    console.log(error);
    if (error.name === "UnsupportedError")
      console.warn("browser not supported");
  }
};


function createSendTransport() {
  socket.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
    console.log('createSendTransport')
    // The server sends back params needed 
    // to create Send Transport on the client side
    if (params.error) {
      console.log(params.error)
      return
    }

    producerTransport = device.createSendTransport(params)
    
    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      console.log("------------- producerTransport.on('connect' ---------------")
      try {
        // Signal local DTLS parameters to the server side transport
        // see server's socket.on('transport-connect', ...)
        await socket.emit('transport-connect', {
          dtlsParameters,
        })
        console.log('dtlsParameters', dtlsParameters)

        // Tell the transport that parameters were transmitted.
        callback()

      } catch (error) {
        errback(error)
      }
      console.log("------------- producerTransport.on('connect' ---------------")

    });

    producerTransport.on('produce', async (parameters, callback, errback) => {
      console.log("-------------- producerTransport.on('produce' --------------")

      try {
        // tell the server to create a Producer
        // with the following parameters and produce
        // and expect back a server side producer id
        // see server's socket.on('transport-produce', ...)
        console.log('parameters.kind', parameters.kind)
        console.log('parameters.rtpParameters', parameters.rtpParameters)
        console.log('parameters.appData', parameters.appData)
        await socket.emit('transport-produce', {
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
          appData: parameters.appData,
        }, ({ id, producersExist }) => {
          // Tell the transport that parameters were transmitted and provide it with the
          // server side producer's id.
          callback({ id })

          console.log('producersExist', producersExist, 'id', id)
          // if producers exist, then join room
          if (producersExist) getProducers()
        })
      } catch (error) {
        errback(error)
      }
      console.log("-------------- producerTransport.on('produce' --------------")


    });



    connectSendTransport();
    
  });
};


async function connectSendTransport() {
  console.log('connectSendTransport')
  console.log('audioParams', audioParams)
  console.log('videoParams', videoParams)
  // we now call produce() to instruct the producer transport
  // to send media to the Router
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
  // this action will trigger the 'connect' and 'produce' events above
  
  audioProducer = await producerTransport.produce(audioParams);
  videoProducer = await producerTransport.produce(videoParams);

  audioProducer.on('trackended', () => {
    console.log('audio track ended')

    // close audio track
  })

  audioProducer.on('transportclose', () => {
    console.log('audio transport ended')

    // close audio track
  })
  
  videoProducer.on('trackended', () => {
    console.log('video track ended')

    // close video track
  })

  videoProducer.on('transportclose', () => {
    console.log('video transport ended')

    // close video track
  })
};