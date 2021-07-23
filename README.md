
# First, get a new game token
GT=$(curl http://127.0.0.1:5000/new_game)

# create a couple of players:
curl http://127.0.0.1:5000/add_player/$GT/traviscj
curl http://127.0.0.1:5000/add_player/$GT/anjorges

# Finally, start the game
curl http://127.0.0.1:5000/start_game/$GT

# now tell us where we can play!
echo http://127.0.0.1:5000/$GT/traviscj
echo http://127.0.0.1:5000/$GT/anjorges
