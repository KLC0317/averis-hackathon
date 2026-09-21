import pymupdf
import numpy as np

# Open image with pymupdf
pix = pymupdf.Pixmap("apps/web/public/task-mu9zqxmp1qkn6.png")
print("Original pixmap:", pix.width, "x", pix.height, "n:", pix.n, "alpha:", pix.alpha)

# Convert to RGB if needed
if pix.n != 3 and pix.n != 4:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)

width = pix.width
height = pix.height

# Convert samples to numpy array
# pix.samples has height * width * n bytes
arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape((height, width, pix.n))

# If n==4, strip alpha or use RGB
rgb = arr[:, :, :3]

# Let's find regions where pixels are not white (e.g. brightness < 245)
is_content = np.any(rgb < 240, axis=2)

# Row-wise projection to find horizontal stripes (top section vs bottom section)
row_content = np.any(is_content, axis=1)
row_indices = np.where(row_content)[0]
print("Content row range:", row_indices[0], "to", row_indices[-1])

# Column-wise projection for top section (top half of image: rows 0 to 450)
top_half = is_content[:480, :]
top_rows = np.where(np.any(top_half, axis=1))[0]
top_cols = np.where(np.any(top_half, axis=0))[0]

print("Top lockup bounds: Y[{}, {}], X[{}, {}]".format(top_rows[0], top_rows[-1], top_cols[0], top_cols[-1]))

# Bottom half
bot_half = is_content[480:, :]
bot_rows = np.where(np.any(bot_half, axis=1))[0] + 480
bot_cols = np.where(np.any(bot_half, axis=0))[0]
print("Bottom half bounds: Y[{}, {}], X[{}, {}]".format(bot_rows[0], bot_rows[-1], bot_cols[0], bot_cols[-1]))

# In top half, find the icon mark bounds vs text bounds
# The mark is on the left, separated by white space from the text "ClearDraft"
top_icon_cols = top_cols[top_cols < 600]
print("Top icon mark X range:", top_icon_cols[0], "to", top_icon_cols[-1])

top_text_cols = top_cols[top_cols >= 500]
print("Top text X range:", top_text_cols[0], "to", top_text_cols[-1])

# Function to crop and make transparent background
def crop_and_transparent(y1, y2, x1, x2, pad=10):
    y1 = max(0, y1 - pad)
    y2 = min(height, y2 + pad)
    x1 = max(0, x1 - pad)
    x2 = min(width, x2 + pad)
    
    sub_rgb = rgb[y1:y2, x1:x2].astype(np.float32)
    h, w, _ = sub_rgb.shape
    
    # Calculate transparency:
    # Background is near white (255, 255, 255).
    # Distance from white (255, 255, 255)
    dist_from_white = 255.0 - np.min(sub_rgb, axis=2)
    # Alpha mask: full opaque if dist > 30, smooth ramp between 0 and 30
    alpha = np.clip(dist_from_white / 25.0 * 255.0, 0, 255).astype(np.uint8)
    
    # Also adjust color to remove white halo
    # C_unhalo = (C - (1-a)*255) / a
    a_float = (alpha.astype(np.float32) / 255.0)[:, :, np.newaxis]
    safe_a = np.maximum(a_float, 0.01)
    unhaloed = np.clip((sub_rgb - (1.0 - safe_a) * 255.0) / safe_a, 0, 255).astype(np.uint8)
    
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = unhaloed
    rgba[:, :, 3] = alpha
    
    pix_out = pymupdf.Pixmap(pymupdf.csRGB, w, h, rgba.tobytes(), True)
    return pix_out

# 1. Full colored logo lockup
full_logo = crop_and_transparent(top_rows[0], top_rows[-1], top_cols[0], top_cols[-1], pad=15)
full_logo.save("apps/web/public/cleardraft-logo.png")
print("Saved apps/web/public/cleardraft-logo.png", full_logo.width, "x", full_logo.height)

# 2. Standalone colored icon mark (square padded)
icon_y1, icon_y2 = top_rows[0], top_rows[-1]
icon_x1, icon_x2 = top_icon_cols[0], top_icon_cols[-1]

# Make square
mark_w = icon_x2 - icon_x1
mark_h = icon_y2 - icon_y1
max_dim = max(mark_w, mark_h)
pad_x = (max_dim - mark_w) // 2
pad_y = (max_dim - mark_h) // 2

icon_mark = crop_and_transparent(icon_y1 - pad_y, icon_y2 + pad_y, icon_x1 - pad_x, icon_x2 + pad_x, pad=12)
icon_mark.save("apps/web/public/cleardraft-icon.png")
print("Saved apps/web/public/cleardraft-icon.png", icon_mark.width, "x", icon_mark.height)

# 3. Favicon (square 64x64 or high-res)
icon_mark.save("apps/web/public/favicon.png")
print("Saved apps/web/public/favicon.png")
