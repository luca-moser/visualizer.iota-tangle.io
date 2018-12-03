package main

import (
	"os"
	"os/signal"
	"syscall"
	"time"
	"gitlab.com/luca-moser/tangle-visualizer/server/server"
)

func main() {
	srv := server.Server{}

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM, os.Interrupt)

	srv.Start()
	select {
	case <-sigs:
		srv.Shutdown(time.Duration(1500) * time.Millisecond)
	}

}