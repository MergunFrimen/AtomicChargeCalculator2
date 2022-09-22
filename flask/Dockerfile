FROM python:3.10 AS build

ENV PYTHONPATH=/usr/local/lib
ENV TZ=US/Central
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# upgrade to latest security releases
RUN apt-get update && apt-get -y upgrade

# setup directories
RUN mkdir -p /home/charge/chargefw2 && \
    mkdir -p /home/charge/flask  && \
    mkdir -p /home/charge/logs

# install build dependencies
RUN apt-get install -y git build-essential cmake ninja-build wget \
        lsb-release software-properties-common libomp-dev \
        libgtest-dev libeigen3-dev libboost-all-dev \
        libfmt-dev nlohmann-json3-dev python3-pybind11 \
        python3-dev python3-pip clang dos2unix

# install nanoflann
RUN git clone --depth 1 --branch v1.3.2 https://github.com/jlblancoc/nanoflann.git && \
    cd nanoflann && mkdir build && cd build && \
    cmake .. -DCMAKE_CXX_COMPILER=clang++ && \
    make && make install

# install gemmi
RUN git clone --depth 1 https://github.com/project-gemmi/gemmi.git && \
    cp -r gemmi/include/gemmi /usr/include

# install chargefw2
RUN git clone --depth 1 https://github.com/MergunFrimen/ChargeFW2.git && \
    cd ChargeFW2 && git checkout master && mkdir build && cd build && \
    cmake .. -GNinja \
        -DCMAKE_CXX_COMPILER=clang++ \
        -DCMAKE_INSTALL_PREFIX=/home/charge/chargefw2 \
        -DCMAKE_BUILD_TYPE=Release && \
    ninja && ninja install

# install litemol
RUN wget http://yavanna.ncbr.muni.cz:9877/share/litemol.tar.gz && \
    mkdir -p /home/charge/flask/app/static/litemol && \
    tar xvzf litemol.tar.gz -C /home/charge/flask/app/static/litemol

FROM build AS prod

# TODO: permissions and nonroot user for tightened security

WORKDIR /home/charge/flask

# install python runtime dependencies
COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

# copy all the files to the container; copy over litemol
COPY . .

CMD ["uwsgi", "app.ini"]
