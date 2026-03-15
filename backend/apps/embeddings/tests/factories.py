"""Factory-boy factories for the embeddings app."""

from __future__ import annotations

import random

import factory

from apps.embeddings.models import Chunk, Document
from apps.embeddings.services import EMBEDDING_DIMENSIONS


class DocumentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Document

    title = factory.Faker("sentence", nb_words=5)
    source = factory.Faker("url")

    @factory.lazy_attribute
    def content(self):
        from faker import Faker

        fake = Faker()
        return " ".join(fake.paragraph() for _ in range(3))


class ChunkFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Chunk

    document = factory.SubFactory(DocumentFactory)
    content = factory.Faker("paragraph")
    chunk_index = factory.Sequence(lambda n: n)

    @factory.lazy_attribute
    def embedding(self):
        """Return a random unit-length float vector of the configured dimension."""
        vec = [random.gauss(0, 1) for _ in range(EMBEDDING_DIMENSIONS)]
        magnitude = sum(v**2 for v in vec) ** 0.5
        return [v / magnitude for v in vec]
