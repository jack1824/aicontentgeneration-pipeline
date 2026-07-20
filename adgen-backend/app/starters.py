"""Starter scaffolds for Show Templates (2026-07-20).

Generic, editable STRUCTURES — a role + a room type + a look — so a user gets a
head start instead of a blank form. These are scaffolds, NOT finished ad creative:
the anchors are deliberately generic placeholders the user rewrites for their own
brand, and the user always supplies the actual episode scripts.

A starter instantiates into a normal DRAFT show (+ its characters/environments),
after which it behaves exactly like a hand-built or brain-drafted show.
"""

STARTERS: list[dict] = [
    {
        "key": "education",
        "title": "Education / Coaching",
        "blurb": "A teacher and students — classroom lessons, tips, explainers.",
        "cast": [
            {"name": "Teacher", "anchor": "an Indian teacher in their 30s, warm approachable face, neat hair, simple professional Indian attire"},
            {"name": "Student", "anchor": "an Indian student in their teens, bright curious face, tidy school uniform"},
        ],
        "rooms": [
            {"name": "Classroom", "anchor": "a bright clean Indian classroom, desks, a board, soft daylight through windows, calm study palette"},
        ],
        "look": {"style": "warm friendly, approachable", "grade": "bright and optimistic",
                 "negative": "blurry, deformed, extra fingers, warped face, low quality"},
    },
    {
        "key": "retail",
        "title": "Shop / Retail",
        "blurb": "A shopkeeper and a customer — offers, new stock, festive deals.",
        "cast": [
            {"name": "Shopkeeper", "anchor": "an Indian shopkeeper in their 40s, friendly confident face, tidy shirt, welcoming demeanor"},
            {"name": "Customer", "anchor": "an Indian customer in their 30s, everyday casual clothes, pleasant expression"},
        ],
        "rooms": [
            {"name": "Shop", "anchor": "a tidy well-stocked Indian retail shop interior, shelves of products, warm shop lighting, inviting palette"},
        ],
        "look": {"style": "clean commercial, inviting", "grade": "warm and vivid",
                 "negative": "blurry, deformed, extra fingers, warped face, cluttered, low quality"},
    },
    {
        "key": "clinic",
        "title": "Clinic / Wellness",
        "blurb": "A doctor and a patient — advice, services, reassurance.",
        "cast": [
            {"name": "Doctor", "anchor": "an Indian doctor in their 40s, calm trustworthy face, clean white coat over formal attire"},
            {"name": "Patient", "anchor": "an Indian patient in their 30s, ordinary clothes, relieved reassured expression"},
        ],
        "rooms": [
            {"name": "Clinic", "anchor": "a clean modern Indian clinic room, examination desk, soft clinical light, calm reassuring palette"},
        ],
        "look": {"style": "clean, reassuring, professional", "grade": "soft and clean",
                 "negative": "blurry, deformed, extra fingers, warped face, clinical harshness, low quality"},
    },
    {
        "key": "founder",
        "title": "Founder / Testimonial",
        "blurb": "One presenter to camera — brand story, announcements, reviews.",
        "cast": [
            {"name": "Founder", "anchor": "an Indian founder in their 30s, confident genuine face, smart-casual professional outfit"},
        ],
        "rooms": [
            {"name": "Office", "anchor": "a modern Indian startup office, clean desk, soft window light, minimal professional palette"},
        ],
        "look": {"style": "authentic, professional, documentary", "grade": "natural and warm",
                 "negative": "blurry, deformed, extra fingers, warped face, low quality"},
    },
    {
        "key": "family",
        "title": "Home / Family",
        "blurb": "A parent and child at home — everyday products, comfort, care.",
        "cast": [
            {"name": "Parent", "anchor": "an Indian parent in their 30s, warm caring face, comfortable home clothes"},
            {"name": "Child", "anchor": "an Indian child around 8, cheerful lively face, casual home clothes"},
        ],
        "rooms": [
            {"name": "Home", "anchor": "a cozy Indian family home interior, living room, warm lamps, homely comfortable palette"},
        ],
        "look": {"style": "warm, homely, heartfelt", "grade": "warm and soft",
                 "negative": "blurry, deformed, extra fingers, warped face, low quality"},
    },
]


def get_starter(key: str) -> dict | None:
    return next((s for s in STARTERS if s["key"] == key), None)
