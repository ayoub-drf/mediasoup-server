from django.contrib import admin

from .models import (
    Channel, 
    CustomUser
)

admin.site.register(Channel)
admin.site.register(CustomUser)