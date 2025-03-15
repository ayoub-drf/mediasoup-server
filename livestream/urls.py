from django.urls import path
from .views import *

urlpatterns = [
    path('', home, name="home"),
    path('profile/<int:userID>/', profile_view, name="profile_view"),
    # path('live-status/<str:username>/', check_live_status, name='check_live_status'),
    path('start-livestream/', start_livestream, name='start_livestream'),
]
