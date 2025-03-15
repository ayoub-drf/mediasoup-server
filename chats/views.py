from django.shortcuts import render
from .models import Channel

channels = Channel.objects.all()
def index(request):
    
    return render(request, 'chats/chats.html', {"channels": channels})

def room(request, room_name):
    
    return render(request, 'chats/room.html', {"room_name": room_name, "channels": channels})

    
    