// const localVideo = document.getElementById("liveVideo");
const watchersCount = document.getElementById("watchers-count");
const videoContainer = document.getElementById("video-container");

let params = {
  // mediasoup params
  encodings: [
    {
      rid: "r0",
      maxBitrate: 100000,
      scalabilityMode: "S1T3",
    },
    {
      rid: "r1",
      maxBitrate: 300000,
      scalabilityMode: "S1T3",
    },
    {
      rid: "r2",
      maxBitrate: 900000,
      scalabilityMode: "S1T3",
    },
  ],
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
  codecOptions: {
    videoGoogleStartBitrate: 1000,
  },
};

const mediasoupClient = require("mediasoup-client");
const io = require("socket.io-client");
const socket = io("http://localhost:3000/livestream", {
  //   withCredentials: true,
  //   transports: ["websocket", "polling"],
});

let videoParams;
let rtpCapabilities;
let device;
let isViewer;
let type;

socket.on("connection-success", ({ socketId }) => {
  console.log("Connected with socket id:", socketId);
});

async function startLivestreaming() {
  getUserMedia();
  isViewer = false;
}

async function getUserMedia() {
  if (type === 'livestream') {
    navigator.getUserMedia(
      {
        audio: false,
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
      },
      streamSuccess,
      (error) => {
        console.log(error.message);
      }
    );
  } else {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });

      await streamSuccess(stream)
    } catch (error) {
      console.log(error)
    }

  }
  
};

async function streamSuccess(stream) {
  // localVideo.srcObject = stream;
  const video = document.createElement('video')
  video.controls = true;
  video.srcObject = stream;
  if (videoContainer.querySelectorAll('video').length <= 0) {
    video.classList.add('w-full', 'h-full', 'object-contain');
  } else {
    video.classList.add('w-[390px]', 'top-0', 'left-0', 'border-red-700', 'border-solid', 'border-2', 'object-contain', 'absolute');
  }
  videoContainer.append(video)
  
  video.play();
  const track = stream.getVideoTracks()[0];
  videoParams = {
    track,
    ...params,
  };

  await getRtpCapabilities();
}

async function getRtpCapabilities() {
  socket.emit("getRtpCapabilities", async (data) => {
    if (data.rtpCapabilities) {
      console.log(`Router RTP Capabilities...`);
    }
    rtpCapabilities = data.rtpCapabilities;
    await createDevice();
  });
}

async function createDevice() {
  try {
    device = new mediasoupClient.Device();

    await device.load({
      routerRtpCapabilities: rtpCapabilities,
    });

    console.log("device RTP Capabilities", device.rtpCapabilities);
  } catch (error) {
    console.log(error);
    if (error.name === "UnsupportedError")
      console.warn("browser not supported");
  }

  if (!isViewer) {
    createSendTransport();
  } else {
    await createReceiveTransport();
  }
}

function createSendTransport() {
  socket.emit("createWebRtcTransport", { sender: true, publisherId: publisherId, mediaType: type }, async ({ params }) => {
    if (params.error) {
      console.log(params.error);
      return;
    }

    producerTransport = device.createSendTransport(params);

    producerTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errback) => {
        console.log("connect", dtlsParameters);
        try {
          // Signal local DTLS parameters to the server side transport
          // see server's socket.on('transport-connect', ...)
          await socket.emit("transport-connect", {
            dtlsParameters,
            publisherId: publisherId,
            mediaType: type
          });

          // Tell the transport that parameters were transmitted.
          callback();
        } catch (error) {
          errback(error);
        }
      }
    );

    producerTransport.on("produce", async (parameters, callback, errback) => {
      console.log("produce", parameters);

      try {

        await socket.emit(
          "transport-produce",
          {
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            appData: parameters.appData,
            publisherId: publisherId,
            mediaType: type
            
          },
          ({ id }) => {

            callback({ id });
          }
        );
      } catch (error) {
        errback(error);
      }
    });

    await connectSendTransport();
  });
}

async function connectSendTransport() {
  // we now call produce() to instruct the producer transport
  // to send media to the Router
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
  // this action will trigger the 'connect' and 'produce' events above
  producer = await producerTransport.produce(videoParams);

  producer.on("trackended", () => {
    console.log("track ended");
  });

  producer.on("transportclose", () => {
    console.log("transport ended");
  });
  type = null;
}


if (document.getElementById('share-screen')) {

  document.getElementById('share-screen').addEventListener("click", async (e) => {
    type = 'screen';
    document.getElementById('share-screen').setAttribute("disabled", true);
  
    await startLivestreaming();
  })
}

if (document.getElementById("start-livestream")) {
  document
  .getElementById("start-livestream")
  .addEventListener("click", async (e) => {
      type = 'livestream';
      document
        .getElementById("start-livestream")
        .setAttribute("disabled", true);
      await startLivestreaming();

      // const res = await fetch('http://127.0.0.1:8000/start-livestream/', {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json"
      //   },
      //   body: JSON.stringify({'user': user})
      // })
      // const data = await res.json()

      // console.log('data', data)
      
    });

    // type = null;
}

async function joinLivestreaming() {
  isViewer = true;
  console.log("joinLivestreaming isViewer", isViewer);
  await getRtpCapabilities();
}

async function createReceiveTransport() {
  console.log("createRecvTransport");
  // see server's socket.on('consume', sender?, ...)
  // this is a call from Consumer, so sender = false
  await socket.emit(
    "createWebRtcTransport",
    { sender: false },
    async ({ params }) => {
      // The server sends back params needed
      // to create Send Transport on the client side
      if (params.error) {
        console.log(params.error);
        return;
      }

      console.log(params);
      consumerTransport = device.createRecvTransport(params);

      consumerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          console.log("connect", dtlsParameters);
          try {
            // Signal local DTLS parameters to the server side transport
            // see server's socket.on('transport-recv-connect', ...)
            await socket.emit("transport-recv-connect", {
              dtlsParameters,
            });

            // Tell the transport that parameters were transmitted.
            callback();
          } catch (error) {
            // Tell the transport that something was wrong
            errback(error);
          }
        }
      );

      await connectRecvTransport()
    }
  );
}

const connectRecvTransport = async () => {
  console.log("connectRecvTransport");
  await socket.emit(
    "consume",
    { rtpCapabilities: device.rtpCapabilities, publisherId: publisherId },
    async ({ params }) => {
      // if (params.error) {
      //   console.log("Cannot Consume");
      //   return;
      // }


      params.forEach(async (consumerParams) => {
        const consumer = await consumerTransport.consume({
          id: consumerParams.id,
          producerId: consumerParams.producerId,
          kind: consumerParams.kind,
          rtpParameters: consumerParams.rtpParameters,
        });
      
        console.log("XMLDocument", consumerParams.mediaType)
        const { track } = consumer;
        const video = document.createElement('video')
        video.controls = true;
        video.srcObject = new MediaStream([track]);
        if (videoContainer.querySelectorAll('video').length <= 0) {
          video.classList.add('w-full', 'h-full', 'object-contain');
        } else {
          video.classList.add('w-[390px]', 'top-0', 'left-0', 'border-red-700', 'border-solid', 'border-2', 'object-contain', 'absolute');
        }
        videoContainer.append(video)
        
        video.play();
      });




      // localVideo.srcObject = new MediaStream([track]);
      // socket.emit("consumer-resume");
    }
  );
  type = null;
};

if (document.getElementById("join-livestream")) {
  document
    .getElementById("join-livestream")
    .addEventListener("click", async (e) => {
      document.getElementById("join-livestream").setAttribute("disabled", true);
      watchersCount.innerText = watchersCount.innerText++;
      // await socket.emit("new-watcher", {dtlsParameters,});
      await joinLivestreaming();
    });
}
