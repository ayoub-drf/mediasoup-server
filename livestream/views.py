from django.shortcuts import render, get_object_or_404
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from .models import LiveStream
from django.views.decorators.csrf import csrf_exempt
import json


User = get_user_model()

@csrf_exempt
def start_livestream(request):
    if request.method == 'POST':
        username = json.loads(request.body)['user']
        user = User.objects.get(username=username)
        live_stream = LiveStream.objects.get_or_create(user=user, is_live=True)
        print('created: ', live_stream[-1])
        return JsonResponse({'created': live_stream[0].is_live}, safe=False)

# def check_live_status(request, username):
#     try:
#         user = User.objects.get(username=username)
#         live_stream = LiveStream.objects.get(user=user)
#         return JsonResponse({'is_live': live_stream.is_live})
#     except LiveStream.DoesNotExist:
#         return JsonResponse({'is_live': False})

def home(request):
    # if request.is_authenticated:
    users = User.objects.exclude(id=request.user.id)
        
    return render(request, 'livestream/home.html', { 'users': users })


def profile_view(request, userID):
    user = get_object_or_404(User, pk=userID)
    return render(request, 'livestream/profile.html', { 'user': user })