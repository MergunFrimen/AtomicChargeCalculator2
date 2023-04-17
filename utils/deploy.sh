#!/bin/bash
set -x

# This script is used to deploy ACC2 on Metacentrum server.
# Assumes Ubuntu 22.04

install_chargefw2() {
  # Set number of processes for make
  nproc=$(($(grep -c processor /proc/cpuinfo) + 1))

  cd || exit 1
  sudo rm -rf ChargeFW2
  git clone https://github.com/MergunFrimen/ChargeFW2.git ChargeFW2
  cd ChargeFW2 || exit 1
  mkdir build && cd build || exit 1
  cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/home/charge/chargefw2 ..
  make -j${nproc}
  sudo make install
}

install_acc2() {
  cd || exit 1
  sudo rm -rf ACC2
  git clone https://github.com/MergunFrimen/AtomicChargeCalculator2.git ACC2
  sudo cp -r ACC2/app/* /home/charge/www/ACC2
}

ACC2_DEPENDENCIES="
  apache2
  dos2unix
  libapache2-mod-wsgi-py3
  python3-flask
  python3-magic
  python3-gemmi
"
CHARGEFW2_DEPENDENCIES="
  cmake
  g++
  gemmi-dev
  git
  libnanoflann-dev
  libboost-filesystem-dev
  libboost-program-options-dev
  libboost-system-dev
  libeigen3-dev
  libfmt-dev
  libstb-dev
  nlohmann-json3-dev
  python3-dev
  pybind11-dev
  tao-pegtl-dev
"

# upgrade packages and install dependencies
sudo apt update && sudo apt -y upgrade
sudo apt install -y ${ACC2_DEPENDENCIES} ${CHARGEFW2_DEPENDENCIES}

# create directories
sudo mkdir -p /home/charge/{chargefw2,logs,www/ACC2,.ssh}

# Setup user charge
sudo useradd charge
sudo chmod 700 /home/charge/.ssh
sudo cp ~/.ssh/authorized_keys /home/charge/.ssh/authorized_keys

# Configure apache for ACC2 
sudo sh -c 'sha256sum /etc/passwd > /etc/ACC2.conf'
sudo sh -c 'cat << EOF > /etc/apache2/sites-available/000-ACC2.conf
<VirtualHost *:80>
        ServerName $(hostname).cerit-sc.cz
        WSGIDaemonProcess ACC2 user=charge group=charge home=/home/charge/www/
        WSGIScriptAlias / /home/charge/www/ACC2/ACC2.wsgi
        WSGIScriptReloading On
        CustomLog /home/charge/logs/access_log common
        ErrorLog /home/charge/logs/error_log
        <Directory /home/charge/www/ACC2>
                WSGIProcessGroup ACC2
                WSGIApplicationGroup %{GLOBAL}
                Require all granted
        </Directory>
</VirtualHost>
EOF'

sudo a2dissite 000-default
sudo a2ensite 000-ACC2

# install external dependencies
install_chargefw2
install_acc2

# Setup scripts for easy update
sudo sh -c 'cat << EOF > /usr/local/bin/update_chargefw2
#!/bin/bash
set -x
nproc=\$((\$(grep -c processor /proc/cpuinfo) + 1))
cd ~/ChargeFW2
sudo rm -rf build
git pull
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/home/charge/chargefw2 ..
make -j\${nproc}
sudo make install
if [ "\$?" -eq 0 ]; then
  sudo chown -R charge:charge /home/charge
  sudo touch /home/charge/www/ACC2/ACC2.wsgi
else
  echo Failed to update ChargeFW2
  exit 1
fi
EOF'

sudo sh -c 'cat << EOF > /usr/local/bin/update_acc2
#!/bin/bash
set -x
cd ~/ACC2
git pull
sudo rm -rf /home/charge/www/ACC2/*
sudo cp -r app/* /home/charge/www/ACC2
sudo mkdir /home/charge/www/ACC2/static/litemol
wget http://yavanna.ncbr.muni.cz:9877/share/litemol.tar.gz -O /tmp/litemol.tar.gz
sudo tar xvzf /tmp/litemol.tar.gz -C /home/charge/www/ACC2/static/litemol
sudo chown -R charge:charge /home/charge
sudo touch /home/charge/www/ACC2/ACC2.wsgi
EOF'

sudo chmod +x /usr/local/bin/update_chargefw2 /usr/local/bin/update_acc2

# Fix permissions
sudo chown -R charge:charge /home/charge

# Clean up
sudo apt-get -y autoremove
sudo apt-get -y clean

# Reload apache to run ACC2
sudo service apache2 reload
