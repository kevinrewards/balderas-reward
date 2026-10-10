"""The combined release supersedes the original Wallet-only installer."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('package-commerce-notifications.py')),run_name='__main__')
