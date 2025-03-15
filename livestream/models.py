from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class LiveStream(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    is_live = models.BooleanField(default=False)
    
    def __str__(self):
        return f'{self.pk}'
