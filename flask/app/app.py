from flask import Flask
from config import CONFIG_FILE
import routes


app = Flask(__name__)


# app.jinja_env.trim_blocks = True
# app.jinja_env.lstrip_blocks = True

# with open(CONFIG_FILE) as f:
#     application.config['SECRET_KEY'] = f.read().strip()

if __name__ == "__main__":
    app.run()
