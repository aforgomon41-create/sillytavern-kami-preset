from PIL import Image
import os
A = os.path.dirname(os.path.abspath(__file__))
for skin in ["grokbot", "manga", "rain"]:
    im = Image.open(os.path.join(A, f"折叠-{skin}-收起.png"))
    im.crop((518, 192, 955, 288)).resize((437 * 3, 96 * 3), Image.LANCZOS).save(os.path.join(A, f"折叠-细节-{skin}.png"))
    print(skin, "ok")
