from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.auth.models import AbstractUser

class CustomUser(AbstractUser):
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to="profiles/%Y/%m/%d/", default="default-avatar.png")

    REQUIRED_FIELDS = ('username', )
    USERNAME_FIELD = 'email'
    def __str__(self):
        return self.username
    
    

class Channel(models.Model):
    name = models.CharField(_("Name"), max_length=50)

    class Meta:
        verbose_name = _("Channel")
        verbose_name_plural = _("Channels")

    def __str__(self):
        return self.name


