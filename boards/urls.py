from django.conf.urls import patterns, url
from django.views.generic import TemplateView

urlpatterns = patterns(
    '',
    url(r'^login/$', TemplateView.as_view(template_name='boards/login.html'), name='login'),
    url(r'^$', TemplateView.as_view(template_name='boards/index.html'), name='index'),
)
