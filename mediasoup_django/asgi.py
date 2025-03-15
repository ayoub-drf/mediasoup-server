import os
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application
from django.urls import re_path, path
from chats.consumers import  (
    MediasoupConsumer
)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mediasoup_django.settings")
django_asgi_app = get_asgi_application()


application = ProtocolTypeRouter({
    "http": django_asgi_app,

    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter([
                path('ws/mediasoup/', MediasoupConsumer.as_asgi()),
                # re_path(r'ws/call/$', CallConsumer.as_asgi()),
                # re_path(r"ws/chat/(?P<receiverID>\w+)/$", ChatConsumer.as_asgi()),
            ])
        )
    ),
})

